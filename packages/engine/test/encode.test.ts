import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FULL, LITE, createBout, decodeEvents, decodeState, encodeEvents, encodeState, mulberry32, packHex, randomLoadout, unpackHex, UNOPENED_TRICK } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = readFileSync(resolve(here, "../vectors/engine-vectors.txt"), "utf8").split("\n").filter((l) => l.startsWith("T ") || l.startsWith("R "));

describe("chain decoder", () => {
  it("unpackHex inverts packHex, including negatives", () => {
    const xs = [0, 1, -1, 32767, -32768, 255, -2];
    expect(unpackHex(packHex(xs))).toEqual(xs);
  });

  it("decode → encode is the identity on every state and event list the contracts were checked against", () => {
    expect(vectors.length).toBeGreaterThan(1000);
    for (const line of vectors) {
      const f = line.split(" ");
      const isTurn = f[0] === "T";
      const stateHex = f[isTurn ? 4 : 4]!;
      const nextHex = f[isTurn ? 5 : 5]!;
      const evHex = f[isTurn ? 6 : 6]!;
      for (const hex of [stateHex, nextHex]) {
        const w = unpackHex(hex);
        expect(encodeState(decodeState(w).state)).toEqual(w);
      }
      const ew = unpackHex(evHex);
      expect(encodeEvents(decodeEvents(ew))).toEqual(ew);
    }
  });

  it("flags unopened placeholders and the paused phase (what a hidden-hand Full bout looks like on-chain)", () => {
    const rng = mulberry32(5);
    const st = createBout(FULL, randomLoadout(rng, FULL), randomLoadout(rng, FULL));
    const w = encodeState(st);
    // hide side 0's bench (fighters 1,2) and its second trick the way the Arena stores them
    for (const i of [1, 2]) {
      const o = 6 + 8 + i * 9;
      w.splice(o, 9, 0, 0, 0, 0, 0, 0, 0, 0, 1); // stats zero, alive
    }
    w[6 + 35 + 3] = UNOPENED_TRICK;
    w[2] = 3; // phase: OpenCards pause
    const v = decodeState(w);
    expect(v.paused).toBe(true);
    expect(v.unopened[0]).toEqual([false, true, true]);
    expect(v.unopened[1]).toEqual([false, false, false]);
    expect(v.unopenedTricks[0]).toEqual([false, true]);
    expect(v.state.sides[0].fighters[1]!.maxHp).toBe(0);
    expect(v.state.sides[0].fighters[1]!.alive).toBe(true);
    expect(v.state.phase).toBe("turn");
  });

  it("rejects malformed input instead of guessing", () => {
    expect(() => decodeState([1, 2, 3])).toThrow();
    const w = encodeState(createBout(LITE, randomLoadout(mulberry32(1), LITE), randomLoadout(mulberry32(2), LITE)));
    w[0] = 9;
    expect(() => decodeState(w)).toThrow();
    expect(() => decodeEvents([0, 0, 0])).toThrow();
    expect(() => decodeEvents([99, 0, 0, 0, 0, 0])).toThrow();
  });
});
