/**
 * Fit a state-value function from real outcomes (logistic regression on public features).
 * The hand-weighted evalState overvalued Grit, which made Brace look dominant in depth-limited analysis.
 *   pnpm --filter @sublevel/engine tsx src/fitEval.ts [bouts]   → writes src/evalWeights.json
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyReplacements, createBout, legalActions, needsReplacement, resolveTurn } from "./engine";
import { randomLoadout } from "./builds";
import { chooseReplacement, greedyBot, habitBot, randomBot, type Bot } from "./bots";
import { FULL, LITE } from "./rulebook";
import { mulberry32, type Rng } from "./rng";
import { features, FEATURE_NAMES } from "./features";
import type { BoutState, Side } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

/** a diverse population of policies so the value function isn't specific to one bot */
const mixBot = (wa: number, wb: number, ws: number, wt: number): Bot => (st, side, rng) => {
  const l = legalActions(st, side);
  const w = l.map((a) => (a <= 1 ? wa : a === 2 ? wb : a <= 5 ? ws : wt));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < l.length; i++) {
    r -= w[i]!;
    if (r <= 0) return l[i]!;
  }
  return l[l.length - 1]!;
};
const POP: Bot[] = [randomBot, habitBot, greedyBot, mixBot(8, 1, 0.4, 1), mixBot(2, 6, 0.8, 1), mixBot(4, 2.5, 1, 1), mixBot(3, 1, 4, 1), mixBot(3, 1.5, 0.5, 6)];

interface Row {
  x: number[];
  y: number;
}

function collect(nBouts: number, rng: Rng): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < nBouts; i++) {
    const format = i % 2 ? FULL : LITE;
    let st: BoutState = createBout(format, randomLoadout(rng, format), randomLoadout(rng, format));
    const bots: [Bot, Bot] = [POP[Math.floor(rng() * POP.length)]!, POP[Math.floor(rng() * POP.length)]!];
    const snaps: { x0: number[]; x1: number[] }[] = [];
    let guard = 0;
    while (st.phase !== "over" && guard++ < 80) {
      if (st.phase === "replace") {
        const need = needsReplacement(st);
        st = applyReplacements(st, [need[0] ? chooseReplacement(st, 0, rng) : 0, need[1] ? chooseReplacement(st, 1, rng) : 0]).state;
        continue;
      }
      snaps.push({ x0: features(st, 0), x1: features(st, 1) });
      st = resolveTurn(st, bots[0](st, 0, rng), bots[1](st, 1, rng)).state;
    }
    const w = st.result?.winner ?? 2;
    const y0 = w === 0 ? 1 : w === 2 ? 0.5 : 0;
    for (const s of snaps) {
      rows.push({ x: s.x0, y: y0 });
      rows.push({ x: s.x1, y: 1 - y0 });
    }
  }
  return rows;
}

function fit(rows: Row[], iters = 400, lr = 0.5, l2 = 1e-3): number[] {
  const d = rows[0]!.x.length;
  const w = new Array<number>(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array<number>(d).fill(0);
    for (const r of rows) {
      let z = 0;
      for (let k = 0; k < d; k++) z += w[k]! * r.x[k]!;
      const p = 1 / (1 + Math.exp(-z));
      const e = p - r.y;
      for (let k = 0; k < d; k++) g[k]! += e * r.x[k]!;
    }
    for (let k = 0; k < d; k++) w[k]! -= (lr * (g[k]! / rows.length + l2 * w[k]!)) ;
  }
  return w;
}

const n = Number(process.argv[2] ?? 6000);
const rng = mulberry32(99);
const rows = collect(n, rng);
const w = fit(rows);
// accuracy / log-loss
let ll = 0;
let acc = 0;
for (const r of rows) {
  let z = 0;
  for (let k = 0; k < w.length; k++) z += w[k]! * r.x[k]!;
  const p = 1 / (1 + Math.exp(-z));
  ll += -(r.y * Math.log(p + 1e-9) + (1 - r.y) * Math.log(1 - p + 1e-9));
  if ((p > 0.5) === (r.y > 0.5)) acc++;
}
console.log(`fit on ${rows.length} states from ${n} bouts: logloss ${(ll / rows.length).toFixed(3)} (baseline 0.693), accuracy ${(acc / rows.length * 100).toFixed(1)}%`);
FEATURE_NAMES.forEach((nm, i) => console.log(`  ${nm.padEnd(14)} ${w[i]!.toFixed(3)}`));
writeFileSync(resolve(here, "evalWeights.json"), JSON.stringify({ names: FEATURE_NAMES, w: w.map((v) => +v.toFixed(5)) }, null, 1));
console.log("wrote src/evalWeights.json");
void ((): Side => 0);
