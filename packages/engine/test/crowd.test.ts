import { describe, expect, it } from "vitest";
import {
  A,
  LITE,
  PC,
  PRESETS,
  actualClasses,
  classOf,
  consensus,
  createBout,
  legalActions,
  mulberry32,
  resolveTurn,
  roomAccuracy,
  roomRead,
  scoreTurn,
  tally,
  eqBot,
  type Loadout,
  type Prediction,
} from "../src/index";

const load = (a: number, b: number): Loadout => ({ fighters: [PRESETS[a]!.build, PRESETS[b]!.build], tricks: [0], lead: 0 });

describe("room predictions: classes, scoring, consensus", () => {
  const st = createBout(LITE, load(0, 3), load(6, 4)); // Rust Dog (Jab LIGHT / Haymaker HEAVY) vs The Accountant (Paper Cut LIGHT / Flurry HEAVY)

  it("every action code maps to exactly one class, using the ACTIVE fighter's attack costs", () => {
    expect(classOf(st, 0, A.ATTACK1)).toBe(PC.LIGHT);
    expect(classOf(st, 0, A.ATTACK2)).toBe(PC.HEAVY);
    expect(classOf(st, 1, A.ATTACK1)).toBe(PC.LIGHT);
    expect(classOf(st, 1, A.ATTACK2)).toBe(PC.HEAVY);
    expect(classOf(st, 0, A.BRACE)).toBe(PC.BRACE);
    for (const sw of [A.SWITCH0, A.SWITCH1, A.SWITCH2]) expect(classOf(st, 0, sw)).toBe(PC.SWITCH);
    for (const t of [A.TRICK0, A.TRICK1]) expect(classOf(st, 0, t)).toBe(PC.TRICK);
    expect(() => classOf(st, 0, 99)).toThrow();
  });

  it("LIGHT vs HEAVY follows the fighter who is active, not slot order", () => {
    // Knuckles Malone (preset 5) leads with attacks [Headbutt c2, Takedown c3]
    const k = createBout(LITE, load(5, 3), load(6, 4));
    expect(classOf(k, 0, A.ATTACK1)).toBe(PC.LIGHT);
    expect(classOf(k, 0, A.ATTACK2)).toBe(PC.HEAVY);
  });

  it("scores one point per fighter read correctly", () => {
    const actual: Prediction = [PC.LIGHT, PC.BRACE];
    expect(scoreTurn([PC.LIGHT, PC.BRACE], actual)).toBe(2);
    expect(scoreTurn([PC.LIGHT, PC.HEAVY], actual)).toBe(1);
    expect(scoreTurn([PC.BRACE, PC.HEAVY], actual)).toBe(0);
  });

  it("tallies the room and finds a consensus only on a clear plurality", () => {
    const heat = tally([
      [PC.LIGHT, PC.BRACE],
      [PC.LIGHT, PC.BRACE],
      [PC.HEAVY, PC.SWITCH],
    ]);
    expect(heat[0]).toEqual([2, 1, 0, 0, 0]);
    expect(heat[1]).toEqual([0, 0, 2, 1, 0]);
    expect(consensus(heat[0]!)).toBe(PC.LIGHT);
    expect(consensus(heat[1]!)).toBe(PC.BRACE);
    expect(consensus([1, 1, 0, 0, 0])).toBeNull(); // tie
    expect(consensus([0, 0, 0, 0, 0])).toBeNull(); // nobody voted
    expect(roomAccuracy(heat[0]!, PC.LIGHT)).toBeCloseTo(2 / 3);
    expect(roomAccuracy([0, 0, 0, 0, 0], PC.LIGHT)).toBe(0);
  });

  it("replays a whole bout: the room-read counts match what actually happened", () => {
    const rng = mulberry32(7);
    let s = createBout(LITE, load(0, 3), load(6, 4));
    const turns: { heat: ReturnType<typeof tally>; actual: Prediction }[] = [];
    let wins = 0;
    while (s.phase === "turn" && turns.length < 8) {
      const a = eqBot(s, 0, rng);
      const b = eqBot(s, 1, rng);
      const actual = actualClasses(s, [a, b]);
      // a room of three that happens to call it perfectly on even turns and wrongly on odd ones
      const right = turns.length % 2 === 0;
      const wrong: Prediction = [((actual[0] + 1) % 5) as Prediction[0], ((actual[1] + 1) % 5) as Prediction[1]];
      const preds = [right ? actual : wrong, right ? actual : wrong, right ? actual : wrong];
      turns.push({ heat: tally(preds), actual });
      if (right) wins += 1;
      for (const p of preds) expect(scoreTurn(p, actual)).toBe(right ? 2 : 0);
      s = resolveTurn(s, a, b).state;
    }
    const rr = roomRead(turns);
    expect(rr.of).toBe(turns.length);
    expect(rr.read).toEqual([wins, wins]);
  });

  it("every legal action in a real state is classifiable", () => {
    for (const side of [0, 1] as const) for (const a of legalActions(st, side)) expect(classOf(st, side, a)).toBeGreaterThanOrEqual(0);
  });
});
