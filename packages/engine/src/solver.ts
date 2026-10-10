import { applyReplacements, legalActions, needsReplacement, resolveTurn } from "./engine";
import { chooseReplacement, evalState } from "./bots";
import { mulberry32 } from "./rng";
import { A, type Action, type BoutState, type Side } from "./types";
import { ATTACKS } from "./rulebook";

/* ------------------------------------------------------------------ */
/* Zero-sum matrix games (row player maximises M)                      */
/* ------------------------------------------------------------------ */

export interface GameSolution {
  /** row player's mixed strategy */
  x: number[];
  /** column player's mixed strategy */
  y: number[];
  /** value of the game for the row player (average of both players' guarantees) */
  value: number;
}

/** Regret matching+ with strategy averaging. O(iters·n·m). Good to ~1e-2 on these tiny games. */
export function solveGame(M: number[][], iters = 700): GameSolution {
  const n = M.length;
  const m = M[0]!.length;
  if (n === 1 && m === 1) return { x: [1], y: [1], value: M[0]![0]! };
  const rr = new Array<number>(n).fill(0); // cumulative (positive) regrets
  const cr = new Array<number>(m).fill(0);
  const xs = new Array<number>(n).fill(0);
  const ys = new Array<number>(m).fill(0);
  const strat = (reg: number[]) => {
    const pos = reg.map((r) => Math.max(0, r));
    const tot = pos.reduce((a, b) => a + b, 0);
    return tot > 1e-12 ? pos.map((p) => p / tot) : reg.map(() => 1 / reg.length);
  };
  for (let t = 1; t <= iters; t++) {
    const x = strat(rr);
    const y = strat(cr);
    for (let i = 0; i < n; i++) xs[i]! += x[i]! * t; // linear averaging
    for (let j = 0; j < m; j++) ys[j]! += y[j]! * t;
    // expected payoffs
    const rowPay = new Array<number>(n).fill(0);
    const colPay = new Array<number>(m).fill(0);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const Mi = M[i]!;
      for (let j = 0; j < m; j++) {
        rowPay[i]! += Mi[j]! * y[j]!;
        colPay[j]! += Mi[j]! * x[i]!;
      }
      v += rowPay[i]! * x[i]!;
    }
    for (let i = 0; i < n; i++) rr[i] = Math.max(0, rr[i]! + (rowPay[i]! - v));
    for (let j = 0; j < m; j++) cr[j] = Math.max(0, cr[j]! + (v - colPay[j]!)); // column minimises
  }
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const x = xs.map((v) => v / sx);
  const y = ys.map((v) => v / sy);
  // guarantees
  let lo = Infinity;
  for (let j = 0; j < m; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i]! * M[i]![j]!;
    lo = Math.min(lo, s);
  }
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += y[j]! * M[i]![j]!;
    hi = Math.max(hi, s);
  }
  return { x, y, value: (lo + hi) / 2 };
}

/* ------------------------------------------------------------------ */
/* Depth-limited equilibrium over the real engine                       */
/* ------------------------------------------------------------------ */

const detRng = () => mulberry32(12345);

/** If a replacement phase follows, resolve it with the standard heuristic so lookahead can continue. */
export function autoReplace(st: BoutState): BoutState {
  if (st.phase !== "replace") return st;
  const r = detRng();
  const need = needsReplacement(st);
  const choices: [number, number] = [need[0] ? chooseReplacement(st, 0, r) : 0, need[1] ? chooseReplacement(st, 1, r) : 0];
  return applyReplacements(st, choices).state;
}

export interface StateGame {
  mine: Action[];
  theirs: Action[];
  M: number[][];
}

/** Payoff matrix for `me` with `depth` turns of equilibrium lookahead (depth 1 = heuristic eval after one turn). */
export function stateGame(st: BoutState, me: Side, depth: number): StateGame {
  const mine = legalActions(st, me);
  const theirs = legalActions(st, (1 - me) as Side);
  const M = mine.map((a) =>
    theirs.map((b) => {
      const out = me === 0 ? resolveTurn(st, a, b) : resolveTurn(st, b, a);
      const nxt = autoReplace(out.state);
      if (depth <= 1 || nxt.phase === "over") return evalState(nxt, me);
      return stateValue(nxt, me, depth - 1);
    }),
  );
  return { mine, theirs, M };
}

export function stateValue(st: BoutState, me: Side, depth: number): number {
  if (st.phase === "over") return evalState(st, me);
  const g = stateGame(st, me, depth);
  return solveGame(g.M, depth > 1 ? 250 : 400).value;
}

/* ------------------------------------------------------------------ */
/* Action kinds (for support / shift analysis)                         */
/* ------------------------------------------------------------------ */

export const KINDS = ["LIGHT", "HEAVY", "BRACE", "SWITCH", "TRICK"] as const;
export type Kind = (typeof KINDS)[number];

export function kindOf(st: BoutState, side: Side, a: Action): Kind {
  if (a === A.BRACE) return "BRACE";
  if (a >= A.SWITCH0 && a <= A.SWITCH2) return "SWITCH";
  if (a === A.TRICK0 || a === A.TRICK1) return "TRICK";
  const s = st.sides[side];
  const f = s.fighters[s.active]!;
  const t = ATTACKS[f.build.attackIds[a === A.ATTACK1 ? 0 : 1]!]!;
  return t.cost >= 3 ? "HEAVY" : "LIGHT";
}

export function kindMix(st: BoutState, side: Side, actions: Action[], mix: number[]): Record<Kind, number> {
  const out: Record<Kind, number> = { LIGHT: 0, HEAVY: 0, BRACE: 0, SWITCH: 0, TRICK: 0 };
  actions.forEach((a, i) => (out[kindOf(st, side, a)] += mix[i]!));
  return out;
}
