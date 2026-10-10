/**
 * S1 simulator — pacing / double-KO / first-KO-snowball / position bias.
 *   pnpm --filter @sublevel/engine sim            (default quick run)
 *   pnpm --filter @sublevel/engine sim -- 2000    (bouts per pairing)
 * The deeper R1–R3 / R6 / R9 tests build on the same harness (TODO).
 */
import { FULL, LITE } from "./rulebook";
import { allBuilds, buildKey, randomLoadout } from "./builds";
import { eqBot, greedyBot, habitBot, makeReader, randomBot, type Bot } from "./bots";
import { mulberry32 } from "./rng";
import { playBout } from "./play";
import type { FormatRules } from "./types";

const N = Number(process.argv[2] ?? 600);

interface Row {
  fmt: string;
  pair: string;
  bouts: number;
  turns: number;
  koRate: number;
  decisionRate: number;
  drawRate: number;
  doubleKoRate: number;
  suddenRate: number;
  firstKoWins: number;
  sideAWin: number;
}

function runPair(format: FormatRules, nameA: string, mkA: () => Bot, nameB: string, mkB: () => Bot, n: number): Row {
  const rng = mulberry32(1337);
  let turns = 0, ko = 0, dec = 0, draw = 0, dko = 0, sudden = 0, fkWins = 0, fkN = 0, aWins = 0, decided = 0;
  for (let i = 0; i < n; i++) {
    const la = randomLoadout(rng, format);
    const lb = randomLoadout(rng, format);
    const log = playBout(format, la, lb, mkA(), mkB(), rng);
    turns += log.turns;
    const r = log.final.result!;
    if (r.reason === "ko") ko++;
    else if (r.reason === "decision") dec++;
    else if (r.reason === "draw") draw++;
    if (log.doubleKo) dko++;
    if (log.final.sudden) sudden++;
    if (log.firstKo >= 0 && r.winner !== 2) {
      fkN++;
      if (r.winner === log.firstKo) fkWins++;
    }
    if (r.winner !== 2) {
      decided++;
      if (r.winner === 0) aWins++;
    }
  }
  return {
    fmt: format.name.split(" ")[0]!,
    pair: `${nameA} v ${nameB}`,
    bouts: n,
    turns: +(turns / n).toFixed(2),
    koRate: +(ko / n).toFixed(3),
    decisionRate: +(dec / n).toFixed(3),
    drawRate: +(draw / n).toFixed(3),
    doubleKoRate: +(dko / n).toFixed(3),
    suddenRate: +(sudden / n).toFixed(3),
    firstKoWins: fkN ? +(fkWins / fkN).toFixed(3) : NaN,
    sideAWin: decided ? +(aWins / decided).toFixed(3) : NaN,
  };
}

const rows: Row[] = [];
for (const f of [LITE, FULL]) {
  rows.push(runPair(f, "random", () => randomBot, "random", () => randomBot, N));
  rows.push(runPair(f, "habit", () => habitBot, "habit", () => habitBot, N));
  rows.push(runPair(f, "greedy", () => greedyBot, "greedy", () => greedyBot, Math.floor(N / 2)));
  rows.push(runPair(f, "eq", () => eqBot, "eq", () => eqBot, Math.floor(N / 4)));
  rows.push(runPair(f, "reader", makeReader, "habit", () => habitBot, Math.floor(N / 2)));
  rows.push(runPair(f, "eq", () => eqBot, "habit", () => habitBot, Math.floor(N / 2)));
  rows.push(runPair(f, "greedy", () => greedyBot, "random", () => randomBot, Math.floor(N / 2)));
}
console.table(rows);

/* build parity quick-look: every build as lead-only proxy vs the field using greedy bots (Lite) */
if (process.argv.includes("--parity")) {
  const rng = mulberry32(7);
  const builds = allBuilds();
  const wins = new Map<string, { w: number; n: number }>();
  for (const b of builds) wins.set(buildKey(b), { w: 0, n: 0 });
  const per = Number(process.argv[3] ?? 30);
  for (const b of builds) {
    for (let i = 0; i < per; i++) {
      const la = randomLoadout(rng, LITE);
      la.fighters[0] = b;
      la.lead = 0;
      const lb = randomLoadout(rng, LITE);
      const log = playBout(LITE, la, lb, greedyBot, greedyBot, rng);
      const w = wins.get(buildKey(b))!;
      w.n++;
      if (log.final.result!.winner === 0) w.w += 1;
      else if (log.final.result!.winner === 2) w.w += 0.5;
    }
  }
  const list = [...wins.entries()].map(([k, v]) => ({ build: k, rate: +(v.w / v.n).toFixed(2) })).sort((a, b) => b.rate - a.rate);
  console.log("TOP 8", list.slice(0, 8));
  console.log("BOTTOM 8", list.slice(-8));
}
