import { ATTACKS, GRIT_CAP, SPREADS, TRICK_COST, advantage, isHeavy } from "./rulebook";
import {
  A,
  type Action,
  type BoutResult,
  type BoutState,
  type FighterState,
  type FormatRules,
  type GameEvent,
  type Loadout,
  type Side,
  type SideState,
  type TurnOutcome,
  TAG,
} from "./types";

/* ---- integer helpers (port 1:1 to Solidity uint math) ---- */
const ceilHalf = (x: number): number => (x + 1) >> 1; // ceil(x/2)
const adv = (x: number): number => (x * 3 + 1) >> 1; // ceil(1.5x)
const dis = (x: number): number => Math.max(1, Math.floor((x * 2) / 3)); // floor(2x/3), min 1
const clampGrit = (g: number): number => Math.max(0, Math.min(GRIT_CAP, g));

export const isAttack = (a: Action): boolean => a === A.ATTACK1 || a === A.ATTACK2;
export const isSwitch = (a: Action): boolean => a >= A.SWITCH0 && a <= A.SWITCH2;
export const isTrick = (a: Action): boolean => a === A.TRICK0 || a === A.TRICK1;
export const switchSlot = (a: Action): number => a - A.SWITCH0;
export const trickSlot = (a: Action): number => a - A.TRICK0;

/** Structured copy of a BoutState (hot path: resolveTurn clones once per call). JSON-equivalent, ~10x faster. */
function cloneSide(s: SideState): SideState {
  return {
    fighters: s.fighters.map((f) => ({ ...f, build: { style: f.build.style, attackIds: [f.build.attackIds[0], f.build.attackIds[1]], spread: f.build.spread } })),
    active: s.active,
    grit: s.grit,
    tricks: s.tricks.map((t) => ({ ...t })),
    braceStreak: s.braceStreak,
    kos: s.kos,
    dealt: s.dealt,
    last: s.last,
  };
}

export function cloneBout(b: BoutState): BoutState {
  return {
    format: b.format,
    turn: b.turn,
    sides: [cloneSide(b.sides[0]), cloneSide(b.sides[1])],
    phase: b.phase,
    sudden: b.sudden,
    result: b.result ? { ...b.result } : null,
  };
}

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

function makeSide(format: FormatRules, l: Loadout): SideState {
  if (l.fighters.length !== format.fighters) throw new Error(`need ${format.fighters} fighters`);
  if (l.tricks.length !== format.tricks) throw new Error(`need ${format.tricks} tricks`);
  if (l.lead < 0 || l.lead >= l.fighters.length) throw new Error("bad lead");
  const fighters: FighterState[] = l.fighters.map((b, i) => {
    const sp = SPREADS[b.spread];
    if (!sp) throw new Error("bad spread");
    const maxHp = Math.max(1, Math.floor((sp.hp * format.hpPct) / 100));
    return {
      build: { style: b.style, attackIds: [b.attackIds[0], b.attackIds[1]], spread: b.spread },
      maxHp,
      hp: maxHp,
      retreat: sp.retreat,
      revealed: !format.hidden || i === l.lead,
      alive: true,
    };
  });
  for (const f of fighters) {
    for (const id of f.build.attackIds) {
      const t = ATTACKS[id];
      if (!t || t.style !== f.build.style) throw new Error("attack not of fighter's style");
    }
    if (f.build.attackIds[0] === f.build.attackIds[1]) throw new Error("duplicate attack");
  }
  return {
    fighters,
    active: l.lead,
    grit: format.startGrit,
    tricks: l.tricks.map((id) => ({ id, used: false, revealed: !format.hidden })),
    braceStreak: 0,
    kos: 0,
    dealt: 0,
    last: -1,
  };
}

export function createBout(format: FormatRules, a: Loadout, b: Loadout): BoutState {
  return {
    format,
    turn: 0,
    sides: [makeSide(format, a), makeSide(format, b)],
    phase: "turn",
    sudden: false,
    result: null,
  };
}

/* ------------------------------------------------------------------ */
/* Legality                                                            */
/* ------------------------------------------------------------------ */

export function legalActions(state: BoutState, side: Side): Action[] {
  if (state.phase !== "turn") return [];
  const s = state.sides[side];
  const act = s.fighters[s.active]!;
  const out: Action[] = [];
  for (let i = 0; i < 2; i++) {
    const t = ATTACKS[act.build.attackIds[i]!]!;
    if (s.grit >= t.cost) out.push(i === 0 ? A.ATTACK1 : A.ATTACK2);
  }
  out.push(A.BRACE);
  if (s.grit >= act.retreat) {
    s.fighters.forEach((f, i) => {
      if (i !== s.active && f.alive) out.push(A.SWITCH0 + i);
    });
  }
  if (s.grit >= TRICK_COST) {
    s.tricks.forEach((t, i) => {
      if (!t.used) out.push(A.TRICK0 + i);
    });
  }
  return out;
}

export function isLegal(state: BoutState, side: Side, a: Action): boolean {
  return legalActions(state, side).includes(a);
}

/* ------------------------------------------------------------------ */
/* Turn resolution                                                     */
/* ------------------------------------------------------------------ */

export function resolveTurn(input: BoutState, actA: Action, actB: Action): TurnOutcome {
  if (input.phase !== "turn") throw new Error("not in turn phase");
  if (!isLegal(input, 0, actA)) throw new Error(`illegal action A: ${actA}`);
  if (!isLegal(input, 1, actB)) throw new Error(`illegal action B: ${actB}`);

  const st = cloneBout(input);
  const ev: GameEvent[] = [];
  const acts: [Action, Action] = [actA, actB];
  const sides = st.sides;
  st.turn += 1;

  const koedThisTurn: [boolean, boolean] = [false, false];

  /* 0. pay costs */
  for (const s of [0, 1] as Side[]) {
    const side = sides[s];
    const a = acts[s];
    const act = side.fighters[side.active]!;
    if (isAttack(a)) side.grit -= ATTACKS[act.build.attackIds[a === A.ATTACK1 ? 0 : 1]!]!.cost;
    else if (isSwitch(a)) side.grit -= act.retreat;
    else if (isTrick(a)) side.grit -= TRICK_COST;
  }

  /* 1. switches */
  for (const s of [0, 1] as Side[]) {
    const a = acts[s];
    if (!isSwitch(a)) continue;
    const side = sides[s];
    const from = side.active;
    const to = switchSlot(a);
    const cost = side.fighters[from]!.retreat;
    side.active = to;
    side.fighters[to]!.revealed = true;
    ev.push({ t: "switch", side: s, from, to, cost });
  }

  /* 2. tricks — pass A (gains/heals/flags), then pass B (damage/denial) */
  const smoke: [boolean, boolean] = [false, false]; // side s played Smoke Bomb
  const sucker: [boolean, boolean] = [false, false]; // side s played Sucker Punch
  const trickId: [number, number] = [-1, -1];
  for (const s of [0, 1] as Side[]) {
    const a = acts[s];
    if (!isTrick(a)) continue;
    const slot = sides[s].tricks[trickSlot(a)]!;
    slot.used = true;
    slot.revealed = true;
    trickId[s] = slot.id;
  }
  for (const s of [0, 1] as Side[]) {
    const id = trickId[s];
    if (id < 0) continue;
    const side = sides[s];
    const f = side.fighters[side.active]!;
    if (id === 1) {
      const healed = Math.min(3, f.maxHp - f.hp);
      f.hp += healed;
      ev.push({ t: "trick", side: s, trick: id, amount: healed });
    } else if (id === 2) {
      const before = side.grit;
      side.grit = clampGrit(side.grit + 2);
      ev.push({ t: "trick", side: s, trick: id, amount: side.grit - before });
    } else if (id === 3) {
      smoke[s] = true;
      ev.push({ t: "trick", side: s, trick: id });
    } else if (id === 4) {
      sucker[s] = true;
    }
  }
  for (const s of [0, 1] as Side[]) {
    const id = trickId[s];
    if (id < 0) continue;
    const o = (1 - s) as Side;
    const opp = sides[o];
    const of = opp.fighters[opp.active]!;
    if (id === 0) {
      const d = Math.min(2, Math.max(0, of.hp));
      of.hp -= 2;
      sides[s].dealt += d;
      ev.push({ t: "trick", side: s, trick: id, target: o, amount: 2 });
    } else if (id === 5) {
      const before = opp.grit;
      opp.grit = clampGrit(opp.grit - 2);
      ev.push({ t: "trick", side: s, trick: id, target: o, amount: before - opp.grit });
    } else if (id === 4) {
      if (isAttack(acts[o])) {
        const d = Math.min(3, Math.max(0, of.hp));
        of.hp -= 3;
        sides[s].dealt += d;
        ev.push({ t: "trick", side: s, trick: id, target: o, amount: 3 });
      } else {
        ev.push({ t: "trick", side: s, trick: id, amount: 0 });
      }
    }
  }

  /* 3. attacks (simultaneous; a fighter KO'd by a trick cannot attack) */
  const dmg: [number, number] = [0, 0];
  const info: Array<Extract<GameEvent, { t: "attack" }> | null> = [null, null];
  for (const s of [0, 1] as Side[]) {
    const a = acts[s];
    if (!isAttack(a)) continue;
    const o = (1 - s) as Side;
    const att = sides[s].fighters[sides[s].active]!;
    const def = sides[o].fighters[sides[o].active]!;
    if (att.hp <= 0 || def.hp <= 0) continue;
    const idx = a === A.ATTACK1 ? 0 : 1;
    const tpl = ATTACKS[att.build.attackIds[idx]!]!;
    const rel = advantage(att.build.style, def.build.style);
    let d = tpl.dmg;
    if (rel > 0) d = adv(d);
    else if (rel < 0 && tpl.tag !== TAG.PIERCE) d = dis(d);
    const countered = tpl.tag === TAG.COUNTER && isSwitch(acts[o]);
    if (countered) d += 2;
    const braced = acts[o] === A.BRACE && tpl.tag !== TAG.GRAPPLE;
    const smoked = smoke[o];
    const nullified = sucker[o];
    const gt = st.format.rules.guardTriangle;
    const heavy = isHeavy(tpl.cost);
    let blocked = false;
    let guardBroken = false;
    let interrupted = false;
    if (nullified) d = 0;
    else {
      if (gt && braced) {
        if (heavy) {
          d = Math.floor((2 * d + 2) / 3); // guard break: ⅔ gets through
          guardBroken = true;
        } else {
          d = 0; // a Brace fully blocks a LIGHT attack
          blocked = true;
        }
      } else if (braced) d = ceilHalf(d);
      if (smoked && !(gt && braced)) d = ceilHalf(d);
      // E3: a LIGHT attack interrupts an incoming HEAVY one (both attacking)
      if (gt && heavy && isAttack(acts[o]) && !braced) {
        const oIdx = acts[o] === A.ATTACK1 ? 0 : 1;
        const otpl = ATTACKS[def.build.attackIds[oIdx]!]!;
        if (!isHeavy(otpl.cost)) {
          d = ceilHalf(d);
          interrupted = true;
        }
      }
    }
    dmg[s] = d;
    info[s] = {
      t: "attack",
      side: s,
      attack: tpl.id,
      dmg: d,
      adv: rel,
      braced,
      smoked,
      countered,
      nullified,
      blocked,
      guardBroken,
      interrupted,
      target: sides[o].active,
    };
  }
  for (const s of [0, 1] as Side[]) {
    const e = info[s];
    if (!e) continue;
    const o = (1 - s) as Side;
    const def = sides[o].fighters[sides[o].active]!;
    const applied = Math.min(dmg[s], Math.max(0, def.hp));
    def.hp -= dmg[s];
    sides[s].dealt += applied;
    ev.push(e);
  }

  /* 4. brace (diminishing: only the first in a row gives Grit) */
  for (const s of [0, 1] as Side[]) {
    const side = sides[s];
    if (acts[s] === A.BRACE) {
      const attacked = isAttack(acts[(1 - s) as Side]);
      const gain = side.braceStreak === 0 && !(st.format.rules.braceGainIfUnattacked && attacked) ? 1 : 0;
      side.grit = clampGrit(side.grit + gain);
      side.braceStreak += 1;
      ev.push({ t: "brace", side: s, gained: gain });
    } else {
      side.braceStreak = 0;
    }
    side.last = acts[s];
  }

  /* 4b. E2: an unpunished Switch refunds its retreat cost */
  if (st.format.rules.switchRefundIfUnattacked) {
    for (const s of [0, 1] as Side[]) {
      if (isSwitch(acts[s]) && !isAttack(acts[(1 - s) as Side])) {
        const sw = ev.find((e) => e.t === "switch" && e.side === s);
        if (sw && sw.t === "switch") {
          sides[s].grit = clampGrit(sides[s].grit + sw.cost);
          sw.refunded = true;
        }
      }
    }
  }

  /* 5. KOs */
  for (const s of [0, 1] as Side[]) {
    const side = sides[s];
    const f = side.fighters[side.active]!;
    if (f.hp <= 0 && f.alive) {
      f.hp = 0;
      f.alive = false;
      f.revealed = true;
      koedThisTurn[s] = true;
      const o = (1 - s) as Side;
      sides[o].kos += 1;
      ev.push({ t: "ko", side: s, fighter: side.active, by: o });
    }
  }

  /* 6. Grit tick */
  for (const s of [0, 1] as Side[]) sides[s].grit = clampGrit(sides[s].grit + 1);

  /* 7. end-of-turn outcome */
  finishTurn(st, koedThisTurn, ev);
  return { state: st, events: ev };
}

function aliveCount(s: SideState): number {
  return s.fighters.filter((f) => f.alive).length;
}

function hpPermille(s: SideState): number {
  let hp = 0;
  let max = 0;
  for (const f of s.fighters) {
    hp += f.alive ? f.hp : 0;
    max += f.maxHp;
  }
  return Math.floor((hp * 1000) / Math.max(1, max));
}

function end(st: BoutState, result: BoutResult, ev: GameEvent[]): void {
  st.phase = "over";
  st.result = result;
  ev.push({ t: "end", result });
}

function finishTurn(st: BoutState, koed: [boolean, boolean], ev: GameEvent[]): void {
  const [s0, s1] = st.sides;

  /* sudden death: first KO wins */
  if (st.sudden) {
    if (koed[0] && koed[1]) return end(st, { winner: 2, reason: "draw" }, ev);
    if (koed[0]) return end(st, { winner: 1, reason: "ko" }, ev);
    if (koed[1]) return end(st, { winner: 0, reason: "ko" }, ev);
  } else {
    const target = st.format.koTarget;
    const r0 = s0.kos >= target;
    const r1 = s1.kos >= target;
    if (r0 && r1) {
      // double KO decides the bout for both → one sudden-death turn between the last fighters
      if (aliveCount(s0) === 0 || aliveCount(s1) === 0) return end(st, { winner: 2, reason: "draw" }, ev);
      st.sudden = true;
      ev.push({ t: "sudden" });
      for (const s of [0, 1] as Side[]) {
        const side = st.sides[s];
        const idx = side.fighters.findIndex((f) => f.alive);
        side.active = idx;
        const f = side.fighters[idx]!;
        f.hp = ceilHalf(f.maxHp);
        f.revealed = true;
        ev.push({ t: "replace", side: s, to: idx });
      }
      return;
    }
    if (r0) return end(st, { winner: 0, reason: "ko" }, ev);
    if (r1) return end(st, { winner: 1, reason: "ko" }, ev);
  }

  /* turn cap → decision */
  if (st.turn >= st.format.turnCap) {
    if (s0.kos !== s1.kos) return end(st, { winner: s0.kos > s1.kos ? 0 : 1, reason: "decision" }, ev);
    const h0 = hpPermille(s0);
    const h1 = hpPermille(s1);
    if (h0 !== h1) return end(st, { winner: h0 > h1 ? 0 : 1, reason: "decision" }, ev);
    if (s0.dealt !== s1.dealt) return end(st, { winner: s0.dealt > s1.dealt ? 0 : 1, reason: "decision" }, ev);
    return end(st, { winner: 2, reason: "draw" }, ev);
  }

  /* replacement needed? */
  if (needsReplacement(st).some(Boolean)) st.phase = "replace";
}

/* ------------------------------------------------------------------ */
/* Replacement (a fresh commit-reveal on-chain; here just a function)  */
/* ------------------------------------------------------------------ */

export function needsReplacement(st: BoutState): [boolean, boolean] {
  const need = (s: SideState) => !s.fighters[s.active]!.alive && aliveCount(s) > 0;
  return [need(st.sides[0]), need(st.sides[1])];
}

export function legalReplacements(st: BoutState, side: Side): number[] {
  if (st.phase !== "replace") return [];
  const s = st.sides[side];
  if (s.fighters[s.active]!.alive) return [];
  return s.fighters.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
}

/** choices[side] = slot to bring in (ignored if that side needs no replacement). */
export function applyReplacements(input: BoutState, choices: [number, number]): TurnOutcome {
  if (input.phase !== "replace") throw new Error("not in replace phase");
  const st = cloneBout(input);
  const ev: GameEvent[] = [];
  for (const s of [0, 1] as Side[]) {
    const legal = legalReplacements(input, s);
    if (legal.length === 0) continue;
    const pick = choices[s];
    if (!legal.includes(pick)) throw new Error(`illegal replacement for side ${s}: ${pick}`);
    st.sides[s].active = pick;
    st.sides[s].fighters[pick]!.revealed = true;
    ev.push({ t: "replace", side: s, to: pick });
  }
  st.phase = "turn";
  return { state: st, events: ev };
}

export function forfeit(input: BoutState, loser: Side): TurnOutcome {
  const st = cloneBout(input);
  const ev: GameEvent[] = [];
  end(st, { winner: (1 - loser) as Side, reason: "forfeit" }, ev);
  return { state: st, events: ev };
}

/* ------------------------------------------------------------------ */
/* Redacted view (Full hides the opponent's bench and unused tricks)   */
/* ------------------------------------------------------------------ */

export function viewFor(st: BoutState, side: Side): BoutState {
  const v = cloneBout(st);
  const opp = v.sides[(1 - side) as Side];
  for (const f of opp.fighters) {
    if (!f.revealed) {
      f.build = { style: 0, attackIds: [-1, -1], spread: -1 };
      f.hp = -1;
      f.maxHp = -1;
      f.retreat = -1;
    }
  }
  for (const t of opp.tricks) {
    if (!t.revealed) t.id = -1;
  }
  return v;
}
