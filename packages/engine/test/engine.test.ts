import { describe, expect, it } from "vitest";
import {
  A,
  ATTACKS,
  FULL,
  LITE,
  NO_FLAGS,
  PRESETS,
  SPREADS,
  TRICKS,
  advantage,
  allBuilds,
  isLegalBuild,
  applyReplacements,
  createBout,
  forfeit,
  legalActions,
  legalReplacements,
  mulberry32,
  playBout,
  randomBot,
  randomLoadout,
  resolveTurn,
  viewFor,
  type BoutState,
  type FighterBuild,
  type FormatRules,
  type Loadout,
} from "../src";

const atk = (name: string) => ATTACKS.find((a) => a.name === name)!.id;
const brawl = (a: string, b: string, spread = 1): FighterBuild => ({ style: 0, attackIds: [atk(a), atk(b)], spread });
const clinch = (a: string, b: string, spread = 1): FighterBuild => ({ style: 1, attackIds: [atk(a), atk(b)], spread });
const slick = (a: string, b: string, spread = 1): FighterBuild => ({ style: 2, attackIds: [atk(a), atk(b)], spread });

/** neutral test format: 2 fighters, 1 trick, big caps, full hp, grit 3 */
const fmt = (o: Partial<FormatRules> = {}): FormatRules => ({
  id: 0,
  name: "test",
  fighters: 2,
  tricks: 1,
  koTarget: 5,
  turnCap: 50,
  startGrit: 3,
  hpPct: 100,
  hidden: false,
  rules: NO_FLAGS,
  ...o,
});

const lo = (fighters: FighterBuild[], tricks: number[] = [0], lead = 0): Loadout => ({ fighters, tricks, lead });
const T = (name: string) => TRICKS.find((t) => t.name === name)!.id;

const BR = brawl("Jab", "Hook"); // Steady: hp 8, retreat 1
const CL = clinch("Shove", "Hold");
const SL = slick("Paper Cut", "Counter");

function bout(a: FighterBuild[], b: FighterBuild[], o: Partial<FormatRules> = {}, ta = [0], tb = [0]): BoutState {
  return createBout(fmt(o), lo(a, ta), lo(b, tb));
}

describe("rulebook", () => {
  it("has 18 attacks, 6 per style, valid ids", () => {
    expect(ATTACKS).toHaveLength(18);
    for (const s of [0, 1, 2]) expect(ATTACKS.filter((a) => a.style === s)).toHaveLength(6);
    ATTACKS.forEach((a, i) => expect(a.id).toBe(i));
  });
  it("style triangle: BRAWL>CLINCH>SLICK>BRAWL", () => {
    expect(advantage(0, 1)).toBe(1);
    expect(advantage(1, 2)).toBe(1);
    expect(advantage(2, 0)).toBe(1);
    expect(advantage(1, 0)).toBe(-1);
    expect(advantage(0, 0)).toBe(0);
  });
  it("has 78 legal builds (one light + one heavy attack) and 12 presets that are legal", () => {
    expect(allBuilds()).toHaveLength(78); // BRAWL 9 + CLINCH 8 + SLICK 9 pairs, x3 spreads
    for (const b of allBuilds()) expect(isLegalBuild(b)).toBe(true);
    expect(isLegalBuild({ style: 0, attackIds: [atk("Hook"), atk("Body Blow")], spread: 1 })).toBe(false); // two light
    expect(isLegalBuild({ style: 0, attackIds: [atk("Jab"), atk("Shove")], spread: 1 })).toBe(false); // wrong style
    expect(PRESETS).toHaveLength(12);
    for (const p of PRESETS) {
      expect(isLegalBuild(p.build)).toBe(true);
      expect(() => createBout(fmt(), lo([p.build, BR]), lo([BR, CL]))).not.toThrow();
    }
  });
});

describe("creation", () => {
  it("scales hp by format and validates loadouts", () => {
    const st = createBout(LITE, lo([BR, CL]), lo([SL, BR]));
    expect(st.sides[0].fighters[0]!.maxHp).toBe(Math.floor((SPREADS[1]!.hp * LITE.hpPct) / 100));
    expect(() => createBout(LITE, lo([BR]), lo([SL, BR]))).toThrow();
    expect(() => createBout(LITE, lo([BR, CL], [0, 1]), lo([SL, BR]))).toThrow();
    expect(() => createBout(LITE, lo([{ ...BR, attackIds: [atk("Jab"), atk("Shove")] }, CL]), lo([SL, BR]))).toThrow();
  });
});

describe("legality", () => {
  it("gates attacks, switches and tricks by Grit", () => {
    const st = bout([BR, CL], [CL, BR], { startGrit: 1 });
    const l = legalActions(st, 0);
    expect(l).toContain(A.ATTACK1); // Jab costs 1
    expect(l).not.toContain(A.ATTACK2); // Hook costs 2
    expect(l).toContain(A.BRACE);
    expect(l).toContain(A.SWITCH1); // retreat 1 <= grit 1
    expect(l).toContain(A.TRICK0); // cost 1
    expect(() => resolveTurn(st, A.ATTACK2, A.BRACE)).toThrow();
  });
  it("cannot switch to the active slot or a dead fighter", () => {
    const st = bout([BR, CL], [CL, BR]);
    expect(legalActions(st, 0)).not.toContain(A.SWITCH0);
  });
});

describe("damage maths (integers)", () => {
  it("advantage = ceil(1.5x), disadvantage = floor(2x/3) min 1", () => {
    // BR Hook(4) vs CL: adv -> 6 ; CL Hold(3) vs BR: disadv -> 2
    const st = bout([BR, SL], [CL, SL]);
    const { state, events } = resolveTurn(st, A.ATTACK2, A.ATTACK2);
    expect(state.sides[1].fighters[0]!.hp).toBe(8 - 6);
    expect(state.sides[0].fighters[0]!.hp).toBe(8 - 2);
    const e = events.find((x) => x.t === "attack" && x.side === 0);
    expect(e && e.t === "attack" && e.adv).toBe(1);
    // grit: 3 - 2 + 1 tick
    expect(state.sides[0].grit).toBe(2);
  });
  it("min damage of 1 on disadvantage", () => {
    // CL Shove(1) vs SL... CLINCH>SLICK so CL has advantage. Use SL Paper Cut(2) vs BR? SLICK>BRAWL adv.
    // Use BR Jab(2) vs SL: BRAWL<SLICK disadv: floor(4/3)=1
    const st = bout([BR, CL], [SL, CL]);
    const { state } = resolveTurn(st, A.ATTACK1, A.BRACE);
    // braced as well: ceil(1/2) = 1
    expect(state.sides[1].fighters[0]!.hp).toBe(7);
  });
});

describe("brace", () => {
  it("halves (ceil) non-grapple damage and gives +1 Grit", () => {
    const st = bout([BR, SL], [CL, SL]);
    const { state } = resolveTurn(st, A.ATTACK2, A.BRACE);
    expect(state.sides[1].fighters[0]!.hp).toBe(8 - 3); // ceil(6/2)
    expect(state.sides[1].grit).toBe(3 + 1 + 1);
  });
  it("GRAPPLE ignores Brace", () => {
    const st = bout([BR, SL], [CL, SL]);
    const { state } = resolveTurn(st, A.BRACE, A.ATTACK2); // Hold(3) disadv vs BR -> 2, not halved
    expect(state.sides[0].fighters[0]!.hp).toBe(8 - 2);
  });
  it("is diminishing: only the first Brace in a row gives Grit", () => {
    let st = bout([BR, SL], [CL, SL]);
    st = resolveTurn(st, A.BRACE, A.BRACE).state; // 3 +1 +1 tick = 5
    expect(st.sides[0].grit).toBe(5);
    st = resolveTurn(st, A.BRACE, A.BRACE).state; // 5, capped; but streak 1 -> +0 +1 tick (cap)
    expect(st.sides[0].braceStreak).toBe(2);
    const lowGrit = bout([BR, SL], [CL, SL], { startGrit: 1 });
    let s2 = resolveTurn(lowGrit, A.BRACE, A.BRACE).state; // 1 +1 +1 = 3
    expect(s2.sides[0].grit).toBe(3);
    s2 = resolveTurn(s2, A.BRACE, A.BRACE).state; // 3 +0 +1 = 4
    expect(s2.sides[0].grit).toBe(4);
  });
});

describe("rider tags", () => {
  it("PIERCE ignores disadvantage", () => {
    const BB = brawl("Body Blow", "Jab"); // Body Blow cost2 dmg3 PIERCE
    const st = bout([BB, CL], [SL, CL]);
    const { state } = resolveTurn(st, A.ATTACK1, A.ATTACK1);
    expect(state.sides[1].fighters[0]!.hp).toBe(8 - 3);
  });
  it("COUNTER adds +2 if the opponent switches", () => {
    const st = bout([SL, CL], [BR, CL]);
    // A: Counter(2 dmg 3, COUNTER). B switches to CL (slot 1). SL vs CL: CLINCH>SLICK -> disadv: floor(2)=2, +2 = 4
    const { state, events } = resolveTurn(st, A.ATTACK2, A.SWITCH1);
    expect(state.sides[1].fighters[1]!.hp).toBe(8 - 4);
    const e = events.find((x) => x.t === "attack");
    expect(e && e.t === "attack" && e.countered).toBe(true);
  });
});

describe("tricks", () => {
  it("Cheap Shot: 2 damage, ignores Brace", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Cheap Shot")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.BRACE);
    expect(state.sides[1].fighters[0]!.hp).toBe(6);
    expect(state.sides[0].tricks[0]!.used).toBe(true);
    expect(state.sides[0].grit).toBe(3 - 1 + 1);
  });
  it("Patch Up heals up to missing hp", () => {
    let st = bout([BR, CL], [CL, BR], {}, [T("Patch Up")], [0]);
    st = resolveTurn(st, A.BRACE, A.ATTACK1).state; // Shove(1) vs BR (dis? CL>... CL attacks BR: BRAWL>CLINCH so CL disadv) dmg1 ->8-1... A braced halves ceil(1/2)=1
    const hpBefore = st.sides[0].fighters[0]!.hp;
    const { state } = resolveTurn(st, A.TRICK0, A.BRACE);
    expect(state.sides[0].fighters[0]!.hp).toBe(Math.min(8, hpBefore + 3));
  });
  it("Second Wind: +2 Grit (cap 5)", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Second Wind")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.BRACE);
    expect(state.sides[0].grit).toBe(5); // 3 -1 +2 =4, +1 tick
  });
  it("Smoke Bomb halves their attack", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Smoke Bomb")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.ATTACK2); // Hold vs BR disadv 2 -> halved 1
    expect(state.sides[0].fighters[0]!.hp).toBe(8 - 1);
  });
  it("Sucker Punch nullifies their attack and deals 3", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Sucker Punch")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.ATTACK2);
    expect(state.sides[0].fighters[0]!.hp).toBe(8);
    expect(state.sides[1].fighters[0]!.hp).toBe(5);
  });
  it("Sucker Punch does nothing if they don't attack", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Sucker Punch")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.BRACE);
    expect(state.sides[1].fighters[0]!.hp).toBe(8);
  });
  it("Low Blow removes 2 Grit after costs", () => {
    const st = bout([BR, CL], [CL, BR], {}, [T("Low Blow")], [0]);
    const { state } = resolveTurn(st, A.TRICK0, A.ATTACK1); // B pays 1 -> 2, low blow -> 0, tick -> 1
    expect(state.sides[1].grit).toBe(1);
  });
  it("a fighter KO'd by a trick cannot attack", () => {
    const st = bout([BR, CL], [CL, BR], { hpPct: 20 }, [T("Cheap Shot")], [0]); // hp = floor(8*0.2)=1
    const { state } = resolveTurn(st, A.TRICK0, A.ATTACK2);
    expect(state.sides[0].fighters[0]!.hp).toBe(1); // untouched
    expect(state.sides[1].fighters[0]!.alive).toBe(false);
  });
});

describe("KOs, sudden death, replacement, cap, forfeit", () => {
  it("Lite: a single KO ends the bout", () => {
    const st = bout([BR, CL], [CL, BR], { hpPct: 20, koTarget: 1 });
    const { state } = resolveTurn(st, A.ATTACK1, A.BRACE);
    expect(state.phase).toBe("over");
    expect(state.result).toEqual({ winner: 0, reason: "ko" });
  });
  it("double KO → sudden death with 50% hp replacements; next KO wins", () => {
    const st = bout([BR, CL], [CL, BR], { hpPct: 20, koTarget: 1 });
    const o = resolveTurn(st, A.ATTACK1, A.ATTACK1);
    expect(o.state.sudden).toBe(true);
    expect(o.state.phase).toBe("turn");
    expect(o.state.sides[0].active).toBe(1);
    expect(o.state.sides[1].active).toBe(1);
    expect(o.state.sides[0].fighters[1]!.hp).toBe(1); // ceil(1/2)=1
    const o2 = resolveTurn(o.state, A.ATTACK1, A.BRACE);
    expect(o2.state.result?.reason).toBe("ko");
  });
  it("sudden death double KO is a draw", () => {
    const st = bout([BR, CL], [CL, BR], { hpPct: 20, koTarget: 1 });
    const o = resolveTurn(st, A.ATTACK1, A.ATTACK1);
    const o2 = resolveTurn(o.state, A.ATTACK1, A.ATTACK1);
    expect(o2.state.result).toEqual({ winner: 2, reason: "draw" });
  });
  it("Full-style: KO leads to a replacement phase", () => {
    const three = (b: FighterBuild) => [b, CL, SL];
    const st = createBout(fmt({ fighters: 3, koTarget: 2, hpPct: 20, hidden: true }), lo(three(BR)), lo(three(CL)));
    const o = resolveTurn(st, A.ATTACK1, A.BRACE); // Jab(2) vs CL adv=3 braced=2 >= hp1 → KO
    expect(o.state.phase).toBe("replace");
    expect(legalReplacements(o.state, 1)).toEqual([1, 2]);
    expect(legalReplacements(o.state, 0)).toEqual([]);
    const r = applyReplacements(o.state, [0, 2]);
    expect(r.state.phase).toBe("turn");
    expect(r.state.sides[1].active).toBe(2);
    expect(() => applyReplacements(o.state, [0, 0])).toThrow();
  });
  it("turn cap → decision by KOs, then hp, then damage, then draw", () => {
    let st = bout([BR, CL], [CL, BR], { turnCap: 2 });
    st = resolveTurn(st, A.BRACE, A.BRACE).state;
    const o = resolveTurn(st, A.BRACE, A.BRACE);
    expect(o.state.result).toEqual({ winner: 2, reason: "draw" });
    let s2 = bout([BR, CL], [CL, BR], { turnCap: 1 });
    const o2 = resolveTurn(s2, A.ATTACK2, A.BRACE); // A damages B
    expect(o2.state.result).toEqual({ winner: 0, reason: "decision" });
  });
  it("forfeit", () => {
    const st = bout([BR, CL], [CL, BR]);
    expect(forfeit(st, 1).state.result).toEqual({ winner: 0, reason: "forfeit" });
  });
});

describe("hidden information", () => {
  it("viewFor hides the opponent's unrevealed bench and tricks in Full", () => {
    const three = (b: FighterBuild) => [b, CL, SL];
    const st = createBout(FULL, lo(three(BR), [0, 1]), lo(three(CL), [2, 3]));
    const v = viewFor(st, 0);
    expect(v.sides[1].fighters[0]!.build.style).toBe(1); // lead is revealed
    expect(v.sides[1].fighters[1]!.hp).toBe(-1);
    expect(v.sides[1].tricks[0]!.id).toBe(-1);
    expect(v.sides[0].fighters[1]!.hp).toBeGreaterThan(0); // own info intact
  });
  it("Lite is fully public", () => {
    const st = createBout(LITE, lo([BR, CL]), lo([SL, BR]));
    const v = viewFor(st, 0);
    expect(v.sides[1].fighters[1]!.hp).toBeGreaterThan(0);
  });
});

describe("determinism and invariants", () => {
  it("resolveTurn is pure/deterministic and does not mutate its input", () => {
    const st = bout([BR, SL], [CL, SL]);
    const snap = JSON.stringify(st);
    const a = resolveTurn(st, A.ATTACK2, A.BRACE);
    const b = resolveTurn(st, A.ATTACK2, A.BRACE);
    expect(JSON.stringify(st)).toBe(snap);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  for (const f of [LITE, FULL]) {
    it(`random play terminates with sane state (${f.name})`, () => {
      const rng = mulberry32(42);
      for (let n = 0; n < 400; n++) {
        const log = playBout(f, randomLoadout(rng, f), randomLoadout(rng, f), randomBot, randomBot, rng);
        expect(log.final.phase).toBe("over");
        expect(log.final.result).not.toBeNull();
        expect(log.turns).toBeLessThanOrEqual(f.turnCap + 1);
        for (const s of log.final.sides) {
          expect(s.grit).toBeGreaterThanOrEqual(0);
          expect(s.grit).toBeLessThanOrEqual(5);
          for (const fi of s.fighters) {
            expect(fi.hp).toBeLessThanOrEqual(fi.maxHp);
            if (fi.alive) expect(fi.hp).toBeGreaterThan(0);
          }
        }
      }
    });
  }
});

describe("experimental rule flags (default off; pinned by tests)", () => {
  const withFlags = (rules: Partial<typeof NO_FLAGS>, a: FighterBuild[], b: FighterBuild[], o: Partial<FormatRules> = {}) =>
    createBout(fmt({ rules: { ...NO_FLAGS, ...rules }, ...o }), lo(a), lo(b));

  it("E1 braceGainIfUnattacked: Brace gives no Grit when attacked", () => {
    const base = bout([BR, SL], [CL, SL]);
    const off = resolveTurn(base, A.BRACE, A.ATTACK1).state; // 3 + 1 (brace) + 1 tick
    expect(off.sides[0].grit).toBe(5);
    const on = resolveTurn(withFlags({ braceGainIfUnattacked: true }, [BR, SL], [CL, SL]), A.BRACE, A.ATTACK1).state;
    expect(on.sides[0].grit).toBe(4);
    // not attacked → still gains
    const calm = resolveTurn(withFlags({ braceGainIfUnattacked: true }, [BR, SL], [CL, SL]), A.BRACE, A.BRACE).state;
    expect(calm.sides[0].grit).toBe(5);
  });

  it("E2 switchRefundIfUnattacked: an unpunished Switch is free", () => {
    const off = resolveTurn(bout([BR, SL], [CL, SL]), A.SWITCH1, A.BRACE).state; // 3 - 1 + 1 tick
    expect(off.sides[0].grit).toBe(3);
    const mk = () => withFlags({ switchRefundIfUnattacked: true }, [BR, SL], [CL, SL]);
    const sr = resolveTurn(mk(), A.SWITCH1, A.BRACE);
    expect(sr.state.sides[0].grit).toBe(4); // refunded
    const swe = sr.events.find((e) => e.t === "switch");
    expect(swe && swe.t === "switch" && swe.refunded).toBe(true);
    expect(resolveTurn(mk(), A.SWITCH1, A.ATTACK1).state.sides[0].grit).toBe(3); // punished → no refund
  });

  it("E3 guardTriangle: Brace blocks LIGHT, HEAVY breaks it for ⅔, LIGHT interrupts HEAVY", () => {
    const OV = brawl("Jab", "Overhand"); // Overhand: cost 3 → heavy, dmg 6, vs CLINCH adv → 9
    const flags = { guardTriangle: true };
    // CL Hold (cost 2, light, grapple!) is grapple → ignores brace; use CL Headbutt (cost 2, light, plain, dmg 4, disadv vs BR → 2)
    const HB = clinch("Shove", "Headbutt");
    const bo = resolveTurn(withFlags(flags, [BR, SL], [HB, SL]), A.BRACE, A.ATTACK2); // light into brace
    const blocked = bo.state;
    expect(blocked.sides[0].fighters[0]!.hp).toBe(8);
    const be = bo.events.find((e) => e.t === "attack");
    expect(be && be.t === "attack" && be.blocked).toBe(true);
    const brk = resolveTurn(withFlags(flags, [OV, SL], [CL, SL]), A.ATTACK2, A.BRACE); // heavy into brace: ⅔ of 9 = 6
    const broken = brk.state;
    expect(broken.sides[1].fighters[0]!.hp).toBe(8 - 6);
    const ge = brk.events.find((e) => e.t === "attack");
    expect(ge && ge.t === "attack" && ge.guardBroken).toBe(true);
    const itr = resolveTurn(withFlags(flags, [OV, SL], [HB, SL], { startGrit: 4 }), A.ATTACK2, A.ATTACK2); // heavy v light: heavy halved 9→5
    expect(itr.state.sides[1].fighters[0]!.hp).toBe(8 - 5);
    const ie = itr.events.find((e) => e.t === "attack" && e.side === 0);
    expect(ie && ie.t === "attack" && ie.interrupted).toBe(true);
    // flags off: the old halving
    const old = resolveTurn(bout([OV, SL], [CL, SL]), A.ATTACK2, A.BRACE).state;
    expect(old.sides[1].fighters[0]!.hp).toBe(8 - 5); // ceil(9/2)
  });
});
