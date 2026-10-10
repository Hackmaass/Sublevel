import { advantage } from "./rulebook";
import { legalActions, resolveTurn } from "./engine";
import type { Rng } from "./rng";
import { A, type Action, type BoutState, type Side } from "./types";

/**
 * Bots live OUTSIDE the engine (they use rng). They are used for the simulator (S1)
 * and as the off-chain "Sparring" opponent in the UI. They read full state; for Full,
 * feed them viewFor() redactions and treat unknown pieces conservatively (TODO).
 */
export type Bot = (state: BoutState, side: Side, rng: Rng) => Action;

export const randomBot: Bot = (state, side, rng) => {
  const l = legalActions(state, side);
  return l[Math.floor(rng() * l.length)]!;
};

/** A human-ish bot: likes attacking, braces when low, switches on bad matchups, rarely tricks. */
export const habitBot: Bot = (state, side, rng) => {
  const me = state.sides[side];
  const opp = state.sides[(1 - side) as Side];
  const f = me.fighters[me.active]!;
  const of = opp.fighters[opp.active]!;
  const legal = legalActions(state, side);
  const bad = advantage(of.build.style, f.build.style) > 0;
  const w = legal.map((a) => {
    if (a === A.ATTACK1) return 3;
    if (a === A.ATTACK2) return me.grit >= 3 ? 4 : 2;
    if (a === A.BRACE) return me.grit <= 1 ? 4 : 1.5;
    if (a >= A.SWITCH0 && a <= A.SWITCH2) return bad ? 3 : 0.5;
    return 0.8;
  });
  let r = rng() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < legal.length; i++) {
    r -= w[i]!;
    if (r <= 0) return legal[i]!;
  }
  return legal[legal.length - 1]!;
};

/* ---------- evaluation (my perspective) ---------- */
// Fitted from real bout outcomes (see fitEval.ts); falls back to a hand-weighted guess if the weights file is missing.
import evalWeights from "./evalWeights.json";
import { features } from "./features";

const W: number[] = (evalWeights as { w: number[] }).w;

/** Value of a state for `me`, scaled to [-1000, 1000] (= 2000·(P(win) − ½)). Terminal states are exactly ±1000 / 0. */
export function evalState(st: BoutState, me: Side): number {
  if (st.phase === "over" && st.result) {
    if (st.result.winner === 2) return 0;
    return st.result.winner === me ? 1000 : -1000;
  }
  const x = features(st, me);
  let z = 0;
  for (let k = 0; k < W.length; k++) z += W[k]! * x[k]!;
  return 2000 * (1 / (1 + Math.exp(-z)) - 0.5);
}

/** payoff matrix M[i][j]: value for `me` when I play mine[i] and opponent plays theirs[j]. */
export function payoffMatrix(state: BoutState, me: Side): { mine: Action[]; theirs: Action[]; M: number[][] } {
  const mine = legalActions(state, me);
  const theirs = legalActions(state, (1 - me) as Side);
  const M = mine.map((a) =>
    theirs.map((b) => {
      const out = me === 0 ? resolveTurn(state, a, b) : resolveTurn(state, b, a);
      return evalState(out.state, me);
    }),
  );
  return { mine, theirs, M };
}

/** Fictitious play for a zero-sum matrix game; returns the row player's mixed strategy. */
export function solveZeroSum(M: number[][], iters = 400): number[] {
  const n = M.length;
  const m = M[0]!.length;
  const rowCount = new Array<number>(n).fill(0);
  const colCount = new Array<number>(m).fill(0);
  rowCount[0] = 1;
  colCount[0] = 1;
  for (let t = 0; t < iters; t++) {
    // row best response to column empirical
    let bestI = 0;
    let bestV = -Infinity;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let j = 0; j < m; j++) v += M[i]![j]! * colCount[j]!;
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    // column best response (minimiser) to row empirical
    let bestJ = 0;
    let bestW = Infinity;
    for (let j = 0; j < m; j++) {
      let v = 0;
      for (let i = 0; i < n; i++) v += M[i]![j]! * rowCount[i]!;
      if (v < bestW) {
        bestW = v;
        bestJ = j;
      }
    }
    rowCount[bestI]! += 1;
    colCount[bestJ]! += 1;
  }
  const total = rowCount.reduce((x, y) => x + y, 0);
  return rowCount.map((c) => c / total);
}

/** One-ply "equilibrium" bot: solves the current turn as a matrix game and samples the mix. */
export const eqBot: Bot = (state, side, rng) => {
  const { mine, M } = payoffMatrix(state, side);
  const mix = solveZeroSum(M);
  let r = rng();
  for (let i = 0; i < mine.length; i++) {
    r -= mix[i]!;
    if (r <= 0) return mine[i]!;
  }
  return mine[mine.length - 1]!;
};

/** Best response to the opponent playing uniformly over legal actions (1-ply expectimax). */
export const greedyBot: Bot = (state, side, rng) => {
  const { mine, M } = payoffMatrix(state, side);
  let best = -Infinity;
  const bests: number[] = [];
  mine.forEach((_, i) => {
    const avg = M[i]!.reduce((x, y) => x + y, 0) / M[i]!.length;
    if (avg > best + 1e-9) {
      best = avg;
      bests.length = 0;
      bests.push(i);
    } else if (Math.abs(avg - best) <= 1e-9) bests.push(i);
  });
  return mine[bests[Math.floor(rng() * bests.length)]!]!;
};

/** Reader: tracks opponent's action kinds and best-responds to the empirical mix (needs history). */
export function makeReader(): Bot {
  const counts = new Map<number, number>();
  let seen = 0;
  return (state, side, rng) => {
    const opp = state.sides[(1 - side) as Side];
    if (opp.last >= 0) {
      counts.set(opp.last, (counts.get(opp.last) ?? 0) + 1);
      seen += 1;
    }
    const { mine, theirs, M } = payoffMatrix(state, side);
    if (seen < 2) return eqBot(state, side, rng);
    const w = theirs.map((a) => (counts.get(a) ?? 0) + 0.5);
    const tot = w.reduce((x, y) => x + y, 0);
    let best = -Infinity;
    let bi = 0;
    mine.forEach((_, i) => {
      const v = M[i]!.reduce((s, x, j) => s + x * (w[j]! / tot), 0);
      if (v > best) {
        best = v;
        bi = i;
      }
    });
    return mine[bi]!;
  };
}

/** Pick a replacement fighter: the best style matchup vs the opponent's active, then highest hp. */
export function chooseReplacement(state: BoutState, side: Side, rng: Rng): number {
  const me = state.sides[side];
  const opp = state.sides[(1 - side) as Side];
  const of = opp.fighters[opp.active]!;
  const cands = me.fighters.map((f, i) => ({ f, i })).filter((x) => x.f.alive);
  cands.sort((a, b) => {
    const sa = advantage(a.f.build.style, of.build.style) * 10 + a.f.hp + rng() * 0.01;
    const sb = advantage(b.f.build.style, of.build.style) * 10 + b.f.hp + rng() * 0.01;
    return sb - sa;
  });
  return cands[0]!.i;
}
