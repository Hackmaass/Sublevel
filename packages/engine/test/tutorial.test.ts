import { describe, expect, it } from "vitest";
import { A, TUTORIAL_FORMAT, TUTORIAL_LOADOUTS, TUTORIAL_STEPS, createBout, legalActions, resolveTurn, tutorialBot, type GameEvent } from "../src/index";

/** Replays the scripted first fight on the real engine and pins what each lesson shows the player. */
describe("tutorial script", () => {
  const play = () => {
    let st = createBout(TUTORIAL_FORMAT, TUTORIAL_LOADOUTS[0], TUTORIAL_LOADOUTS[1]);
    const turns: { events: GameEvent[]; after: typeof st }[] = [];
    for (const step of TUTORIAL_STEPS) {
      expect(legalActions(st, 0)).toContain(step.me);
      const opp = tutorialBot(st, 1, () => 0);
      expect(opp).toBe(step.opp);
      expect(legalActions(st, 1)).toContain(opp);
      const out = resolveTurn(st, step.me, opp);
      st = out.state;
      turns.push({ events: out.events, after: st });
    }
    return turns;
  };
  const attacks = (ev: GameEvent[]) => ev.flatMap((e) => (e.t === "attack" ? [e] : []));

  it("every scripted move is legal and the bout ends in a KO on the last turn only", () => {
    const turns = play();
    expect(turns.map((t) => t.after.phase)).toEqual(["turn", "turn", "turn", "turn", "turn", "over"]);
    expect(turns[5]!.after.result).toEqual({ winner: 0, reason: "ko" });
  });

  it("T1: you are at a disadvantage (weak hit), they have the advantage", () => {
    const [mine, theirs] = [attacks(play()[0]!.events).find((a) => a.side === 0)!, attacks(play()[0]!.events).find((a) => a.side === 1)!];
    expect(mine.adv).toBe(-1);
    expect(theirs.adv).toBe(1);
    expect(theirs.dmg).toBeGreaterThan(mine.dmg);
  });

  it("T2: Brace fully blocks their LIGHT attack", () => {
    const hit = attacks(play()[1]!.events).find((a) => a.side === 1)!;
    expect(hit.blocked).toBe(true);
    expect(hit.dmg).toBe(0);
  });

  it("T3: your HEAVY attack breaks their Brace", () => {
    const hit = attacks(play()[2]!.events).find((a) => a.side === 0)!;
    expect(hit.guardBroken).toBe(true);
    expect(hit.dmg).toBeGreaterThan(0);
  });

  it("T4: the Switch is free because they did not attack", () => {
    const sw = play()[3]!.events.find((e) => e.t === "switch");
    expect(sw && sw.t === "switch" && sw.refunded).toBe(true);
    expect(play()[3]!.after.sides[0].active).toBe(1);
  });

  it("T5: your LIGHT attack interrupts their HEAVY one, with a style advantage", () => {
    const ev = attacks(play()[4]!.events);
    expect(ev.find((a) => a.side === 1)!.interrupted).toBe(true);
    expect(ev.find((a) => a.side === 0)!.adv).toBe(1);
  });

  it("T6: Cheap Shot is what lands the KO", () => {
    const ev = play()[5]!.events;
    expect(ev.some((e) => e.t === "trick" && e.trick === 0)).toBe(true);
    expect(ev.some((e) => e.t === "ko" && e.by === 0)).toBe(true);
  });

  it("the coach's claims hold: T5 they hold 5 Grit and could go HEAVY; T6 they are one scratch from done", () => {
    let st = createBout(TUTORIAL_FORMAT, TUTORIAL_LOADOUTS[0], TUTORIAL_LOADOUTS[1]);
    const before: typeof st[] = [];
    for (const step of TUTORIAL_STEPS) {
      before.push(st);
      st = resolveTurn(st, step.me, step.opp).state;
    }
    expect(before[4]!.sides[1].grit).toBe(5); // "He's got 5 Grit saved up"
    expect(legalActions(before[4]!, 1)).toContain(A.ATTACK2); // ...so a HEAVY is on the table
    const foe = before[5]!.sides[1];
    expect(foe.fighters[foe.active]!.hp).toBeLessThanOrEqual(2); // "one scratch from done": Cheap Shot (2) finishes it
    expect(before[5]!.sides[0].grit).toBeGreaterThanOrEqual(1); // and you can afford the trick
    expect(before[3]!.sides[0].fighters[0]!.hp).toBeLessThan(before[3]!.sides[0].fighters[0]!.maxHp); // "Rust Dog is hurting"
  });

  it("uses the hand-picked slots the UI expects (Switch slot 1, trick 0)", () => {
    expect(TUTORIAL_STEPS[3]!.me).toBe(A.SWITCH1);
    expect(TUTORIAL_STEPS[5]!.me).toBe(A.TRICK0);
  });
});
