/**
 * Format tuning sweep:  pnpm --filter @sublevel/engine tune
 * Targets  Lite: 4.5–6 turns, ≥60% KO finish, double-KO ≤ 15%
 *          Full: 6–9 turns,   ≥55% KO finish, decision ≤ 45%, double-KO ≤ 25%
 */
import { FULL, LITE } from "./rulebook";
import { randomLoadout } from "./builds";
import { eqBot, habitBot, type Bot } from "./bots";
import { mulberry32 } from "./rng";
import { playBout } from "./play";
import type { FormatRules } from "./types";

function measure(format: FormatRules, bot: Bot, n: number) {
  const rng = mulberry32(99);
  let turns = 0, ko = 0, dec = 0, dko = 0, draw = 0;
  for (let i = 0; i < n; i++) {
    const log = playBout(format, randomLoadout(rng, format), randomLoadout(rng, format), bot, bot, rng);
    turns += log.turns;
    const r = log.final.result!.reason;
    if (r === "ko") ko++;
    else if (r === "decision") dec++;
    else if (r === "draw") draw++;
    if (log.doubleKo) dko++;
  }
  return { turns: +(turns / n).toFixed(2), ko: +(ko / n).toFixed(2), dec: +(dec / n).toFixed(2), dko: +(dko / n).toFixed(2), draw: +(draw / n).toFixed(2) };
}

const which = process.argv[2] ?? "both";
const rows: Record<string, unknown>[] = [];
const N = Number(process.argv[3] ?? 120);

if (which !== "full") {
  for (const hpPct of [80, 100, 120, 140]) {
    for (const startGrit of [2, 3]) {
      for (const turnCap of [6, 8]) {
        const f: FormatRules = { ...LITE, hpPct, startGrit, turnCap };
        rows.push({ fmt: "Lite", hpPct, startGrit, turnCap, habit: JSON.stringify(measure(f, habitBot, N * 2)), eq: JSON.stringify(measure(f, eqBot, N)) });
      }
    }
  }
}
if (which !== "lite") {
  for (const hpPct of [50, 60, 75, 90]) {
    for (const startGrit of [2, 3]) {
      for (const turnCap of [10, 12]) {
        const f: FormatRules = { ...FULL, hpPct, startGrit, turnCap };
        rows.push({ fmt: "Full", hpPct, startGrit, turnCap, habit: JSON.stringify(measure(f, habitBot, N * 2)), eq: JSON.stringify(measure(f, eqBot, N)) });
      }
    }
  }
}
console.table(rows);
