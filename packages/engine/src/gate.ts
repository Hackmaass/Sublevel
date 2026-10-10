/**
 * The depth gate (R1–R3, R6, R8) — decides whether the rules have enough skill depth to port to Solidity.
 *   pnpm --filter @sublevel/engine gate r12 [states]     R1/R2: equilibrium support and state-dependence
 *   pnpm --filter @sublevel/engine gate r3  [bouts]      R3 : does reading (scouting) pay?
 *   pnpm --filter @sublevel/engine gate r6  [perBuild]   R6 : build parity round-robin (135 builds)
 *   pnpm --filter @sublevel/engine gate all
 */
import { ATTACKS, FULL, LITE, withRules } from "./rulebook";
import { allBuilds, buildKey, randomLoadout } from "./builds";
import { chooseReplacement, evalState, greedyBot, habitBot, randomBot, type Bot } from "./bots";
import { needsReplacement, resolveTurn, applyReplacements, createBout, legalActions } from "./engine";
import { mulberry32, type Rng } from "./rng";
import { playBout } from "./play";
import { KINDS, kindMix, kindOf, solveGame, stateGame, type Kind } from "./solver";
import type { BoutState, FormatRules, Side } from "./types";

const cmd = process.argv[2] ?? "all";
const arg = Number(process.argv[3] ?? NaN);

/* ------------------------------------------------------------------ */
/* R1 / R2                                                             */
/* ------------------------------------------------------------------ */

interface Sample {
  mix: Record<Kind, number>;
  gritB: "low" | "mid" | "high";
  pos: "lead" | "even" | "trail";
  tricks: boolean;
  kinds: number;
  max: number;
}

function collectStates(format: FormatRules, n: number, rng: Rng): { st: BoutState; side: Side }[] {
  const out: { st: BoutState; side: Side }[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    let st = createBout(format, randomLoadout(rng, format), randomLoadout(rng, format));
    for (let t = 0; t < format.turnCap && st.phase !== "over"; t++) {
      if (st.phase === "replace") {
        const need = needsReplacement(st);
        st = applyReplacements(st, [need[0] ? chooseReplacement(st, 0, rng) : 0, need[1] ? chooseReplacement(st, 1, rng) : 0]).state;
        continue;
      }
      if (rng() < 0.45) out.push({ st, side: 0 });
      const a = habitBot(st, 0, rng);
      const b = habitBot(st, 1, rng);
      st = resolveTurn(st, a, b).state;
    }
  }
  return out.slice(0, n);
}

function r12(format: FormatRules, n: number, quiet = false) {
  const log = quiet ? () => {} : console.log;
  const rng = mulberry32(2025);
  const states = collectStates(format, n, rng);
  const samples: Sample[] = [];
  const t0 = Date.now();
  for (const { st, side } of states) {
    const g = stateGame(st, side, 2);
    const sol = solveGame(g.M, 500);
    const mix = kindMix(st, side, g.mine, sol.x);
    const me = st.sides[side];
    const diff = evalState(st, side);
    samples.push({
      mix,
      gritB: me.grit <= 1 ? "low" : me.grit <= 3 ? "mid" : "high",
      pos: diff > 12 ? "lead" : diff < -12 ? "trail" : "even",
      tricks: me.tricks.some((t) => !t.used),
      kinds: KINDS.filter((k) => mix[k] >= 0.08).length,
      max: Math.max(...KINDS.map((k) => mix[k])),
    });
  }
  const avg = (xs: Sample[]): Record<Kind, number> => {
    const o: Record<Kind, number> = { LIGHT: 0, HEAVY: 0, BRACE: 0, SWITCH: 0, TRICK: 0 };
    if (!xs.length) return o;
    for (const s of xs) for (const k of KINDS) o[k] += s.mix[k] / xs.length;
    return o;
  };
  const tv = (a: Record<Kind, number>, b: Record<Kind, number>) => 0.5 * KINDS.reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);
  const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)] ?? 0;

  // which kind is the (near-)pure equilibrium action, by grit bucket?
  const pure: Record<string, Record<string, number>> = {};
  for (const s of samples) {
    const top = KINDS.reduce((a, k) => (s.mix[k] > s.mix[a] ? k : a), KINDS[0]!);
    const key = s.max >= 0.9 ? top : "mixed";
    pure[s.gritB] ??= {};
    pure[s.gritB]![key] = (pure[s.gritB]![key] ?? 0) + 1;
  }
  log("   pure-equilibrium action by grit bucket:", JSON.stringify(pure));
  const support3 = samples.filter((s) => s.kinds >= 3).length / samples.length;
  const maxOK = samples.filter((s) => s.max <= 0.6).length / samples.length;
  const overall = avg(samples);
  const unused = KINDS.filter((k) => samples.every((s) => s.mix[k] < 0.03));
  const low = avg(samples.filter((s) => s.gritB === "low"));
  const high = avg(samples.filter((s) => s.gritB === "high"));
  const lead = avg(samples.filter((s) => s.pos === "lead"));
  const trail = avg(samples.filter((s) => s.pos === "trail"));
  const trk = avg(samples.filter((s) => s.tricks));
  const notrk = avg(samples.filter((s) => !s.tricks));

  log(`\n=== R1/R2 · ${format.name} · ${samples.length} sampled states (depth-2 equilibrium, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  log("mean kind mix:", Object.fromEntries(KINDS.map((k) => [k, +overall[k].toFixed(3)])));
  log(`R1 support≥3 kinds (≥8%): ${(support3 * 100).toFixed(0)}% of states   max-weight≤60%: ${(maxOK * 100).toFixed(0)}%   kinds unused in every state: ${unused.join(",") || "none"}`);
  log(`   median support ${pct(samples.map((s) => s.kinds), 0.5)} · p90 max weight ${pct(samples.map((s) => s.max), 0.9).toFixed(2)}`);
  log(`R2 TV distance  low-vs-high grit: ${tv(low, high).toFixed(2)}   lead-vs-trail: ${tv(lead, trail).toFixed(2)}   tricks-vs-none: ${tv(trk, notrk).toFixed(2)}   (target ≥ 0.25)`);
  log(`   low grit mix   :`, Object.fromEntries(KINDS.map((k) => [k, +low[k].toFixed(2)])));
  log(`   high grit mix  :`, Object.fromEntries(KINDS.map((k) => [k, +high[k].toFixed(2)])));
  log(`   lead mix       :`, Object.fromEntries(KINDS.map((k) => [k, +lead[k].toFixed(2)])));
  log(`   trail mix      :`, Object.fromEntries(KINDS.map((k) => [k, +trail[k].toFixed(2)])));
  const support2 = samples.filter((s) => KINDS.filter((k) => s.mix[k] >= 0.15).length >= 2).length / samples.length;
  const pureShare = samples.filter((s) => s.max >= 0.9).length / samples.length;
  return { support3, support2, pureShare, maxOK, tvGrit: tv(low, high), tvPos: tv(lead, trail), tvTrick: tv(trk, notrk), unused };
}

/* ------------------------------------------------------------------ */
/* R3 — reading pays                                                   */
/* ------------------------------------------------------------------ */

type Counts = Map<string, number[]>; // bucket → counts per kind

const bucketOf = (st: BoutState, side: Side): string => {
  const me = st.sides[side];
  const opp = st.sides[(1 - side) as Side];
  const f = me.fighters[me.active]!;
  const of = opp.fighters[opp.active]!;
  const bad = (of.build.style + 1) % 3 === f.build.style ? 1 : (f.build.style + 1) % 3 === of.build.style ? 2 : 0;
  return `${me.grit <= 1 ? "L" : me.grit <= 3 ? "M" : "H"}${bad}`;
};

/** record what the observed player does, keyed by public state bucket (this is the on-chain "scouting report") */
function observe(book: Counts, st: BoutState, side: Side, a: number) {
  const k = bucketOf(st, side);
  const row = book.get(k) ?? new Array<number>(KINDS.length).fill(0);
  row[KINDS.indexOf(kindOf(st, side, a))]! += 1;
  book.set(k, row);
}

function makeScoutReader(book: Counts): Bot {
  return (st, side, rng) => {
    const opp = (1 - side) as Side;
    const mine = legalActions(st, side);
    const theirs = legalActions(st, opp);
    const row = book.get(bucketOf(st, opp));
    const total = row ? row.reduce((a, b) => a + b, 0) : 0;
    if (!row || total < 8) return greedyBot(st, side, rng);
    // opponent distribution over concrete actions: kind prob split evenly among legal actions of that kind
    const kindOfAct = theirs.map((a) => kindOf(st, opp, a));
    const kcount: Record<string, number> = {};
    kindOfAct.forEach((k) => (kcount[k] = (kcount[k] ?? 0) + 1));
    const w = theirs.map((_, j) => ((row[KINDS.indexOf(kindOfAct[j]!)]! + 0.3) / (total + 0.3 * KINDS.length)) / kcount[kindOfAct[j]!]!);
    const sw = w.reduce((a, b) => a + b, 0);
    let best = -Infinity;
    let bi = 0;
    mine.forEach((a, i) => {
      let v = 0;
      theirs.forEach((b, j) => {
        const out = side === 0 ? resolveTurn(st, a, b) : resolveTurn(st, b, a);
        v += (w[j]! / sw) * evalState(out.state, side);
      });
      if (v > best) {
        best = v;
        bi = i;
      }
    });
    void rng;
    return mine[bi]!;
  };
}

function winRate(format: FormatRules, botA: Bot, botB: Bot, n: number, rng: Rng): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const log = playBout(format, randomLoadout(rng, format), randomLoadout(rng, format), botA, botB, rng);
    const r = log.final.result!;
    w += r.winner === 0 ? 1 : r.winner === 2 ? 0.5 : 0;
  }
  return w / n;
}

function r3(format: FormatRules, bouts: number) {
  const rng = mulberry32(31337);
  // 1) the scouting book: observe the habit bot over K public bouts (vs random opposition)
  const book: Counts = new Map();
  const K = 60;
  for (let i = 0; i < K; i++) {
    const watcher: Bot = (st, side, r) => {
      const a = habitBot(st, side, r);
      observe(book, st, side, a);
      return a;
    };
    playBout(format, randomLoadout(rng, format), randomLoadout(rng, format), watcher, randomBot, rng);
  }
  const reader = makeScoutReader(book);
  const eq = eqDepthBot(1, 300); // the spec's baseline: a skilled, mixed (equilibrium) bot that does NOT scout
  const nHalf = bouts;
  // test both sides to cancel position bias
  const tests = (A: Bot, B: Bot) => {
    const a = winRate(format, A, B, nHalf, rng);
    const b = 1 - winRate(format, B, A, nHalf, rng);
    return (a + b) / 2;
  };
  const readerVsHabit = tests(reader, habitBot);
  const eqVsHabit = tests(eq, habitBot);
  const readerVsEq = tests(reader, eq);
  const margin = (readerVsHabit - eqVsHabit) * 100;
  console.log(`\n=== R3 · ${format.name} · ${nHalf * 2} bouts per pairing, scouting book from ${K} public bouts`);
  console.log(`reader v habit: ${(readerVsHabit * 100).toFixed(1)}%   skilled-nonscouting v habit: ${(eqVsHabit * 100).toFixed(1)}%   → margin ${margin.toFixed(1)} pts (target ≥ 8)`);
  console.log(`reader v skilled: ${(readerVsEq * 100).toFixed(1)}%   (must not dominate: ≤ 58%)`);
  return { margin, readerVsEq: readerVsEq };
}

/* ------------------------------------------------------------------ */
/* R6 — build parity                                                   */
/* ------------------------------------------------------------------ */

function r6(format: FormatRules, per: number) {
  const rng = mulberry32(777);
  const builds = allBuilds();
  const res = builds.map((b) => {
    let w = 0;
    for (let i = 0; i < per; i++) {
      const la = randomLoadout(rng, format);
      la.fighters[0] = b;
      la.lead = 0;
      const lb = randomLoadout(rng, format);
      const side = i % 2; // alternate seat
      const log = side === 0 ? playBout(format, la, lb, greedyBot, greedyBot, rng) : playBout(format, lb, la, greedyBot, greedyBot, rng);
      const r = log.final.result!;
      if (r.winner === 2) w += 0.5;
      else if (r.winner === side) w += 1;
    }
    return { key: buildKey(b), rate: w / per, style: b.style };
  });
  const sorted = res.slice().sort((a, b) => b.rate - a.rate);
  const out = res.filter((r) => r.rate < 0.4 || r.rate > 0.6).length;
  const byStyle = [0, 1, 2].map((s) => {
    const xs = res.filter((r) => r.style === s);
    return +(xs.reduce((a, b) => a + b.rate, 0) / xs.length).toFixed(3);
  });
  console.log(`\n=== R6 · ${format.name} · ${builds.length} builds × ${per} bouts`);
  console.log(`style mean win rate [BRAWL, CLINCH, SLICK]: ${JSON.stringify(byStyle)}`);
  console.log(`builds outside 40–60%: ${out}/${builds.length}   range ${(sorted[sorted.length - 1]!.rate * 100).toFixed(0)}–${(sorted[0]!.rate * 100).toFixed(0)}%`);
  // additive effects: mean win rate of builds containing each attack / spread, relative to the mean
  const gm = res.reduce((a, b) => a + b.rate, 0) / res.length;
  const eff = new Map<string, { s: number; n: number }>();
  const add = (k: string, v: number) => {
    const e = eff.get(k) ?? { s: 0, n: 0 };
    e.s += v;
    e.n += 1;
    eff.set(k, e);
  };
  builds.forEach((b, i) => {
    add(`atk ${ATTACKS[b.attackIds[0]]!.name}`, res[i]!.rate);
    add(`atk ${ATTACKS[b.attackIds[1]]!.name}`, res[i]!.rate);
    add(`spread ${b.spread}`, res[i]!.rate);
  });
  console.log("EFFECTS (mean win rate of builds containing X; global mean " + (gm * 100).toFixed(1) + "%):");
  console.log([...eff.entries()].map(([k, v]) => `${k}: ${((v.s / v.n) * 100).toFixed(0)}%`).join(" | "));
  console.log("TOP 6   ", sorted.slice(0, 6).map((r) => `${r.key} ${(r.rate * 100).toFixed(0)}%`).join(" | "));
  console.log("BOTTOM 6", sorted.slice(-6).map((r) => `${r.key} ${(r.rate * 100).toFixed(0)}%`).join(" | "));
  return { out, byStyle, sorted };
}


/* ------------------------------------------------------------------ */
/* META — archetype strategies played whole-bout against each other    */
/* ------------------------------------------------------------------ */

function weighted(legal: number[], w: number[], rng: Rng): number {
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < legal.length; i++) {
    r -= w[i]!;
    if (r <= 0) return legal[i]!;
  }
  return legal[legal.length - 1]!;
}
const mk = (wa: number, wb: number, ws: number, wt: number): Bot => (st, side, rng) => {
  const l = legalActions(st, side);
  const w = l.map((a) => (a === 0 || a === 1 ? wa : a === 2 ? wb : a <= 5 ? ws : wt));
  return weighted(l, w, rng);
};
const ARCH: Record<string, Bot> = {
  aggro: mk(8, 1, 0.4, 1),
  turtle: mk(2, 6, 0.8, 1),
  balanced: mk(4, 2.5, 1, 1),
  switchy: mk(3, 1, 4, 1),
  trickster: mk(3, 1.5, 0.5, 6),
  heavy: (st, side, rng) => {
    const l = legalActions(st, side);
    const atk = l.filter((a) => a <= 1);
    if (atk.length) {
      const s = st.sides[side];
      const f = s.fighters[s.active]!;
      let best = atk[0]!;
      let bestD = -1;
      for (const a of atk) {
        const t = ATTACKS[f.build.attackIds[a === 0 ? 0 : 1]!]!;
        if (t.dmg > bestD) {
          bestD = t.dmg;
          best = a;
        }
      }
      return best;
    }
    return weighted(l, l.map((a) => (a === 2 ? 3 : 1)), rng);
  },
  mirror: (st, side, rng) => {
    // reactive: brace after the opponent attacked, attack after the opponent braced
    const l = legalActions(st, side);
    const opp = st.sides[(1 - side) as Side];
    const last = opp.last;
    if (last === 0 || last === 1) return l.includes(2) && rng() < 0.7 ? 2 : weighted(l, l.map((a) => (a <= 1 ? 2 : 1)), rng);
    if (last === 2) return weighted(l, l.map((a) => (a <= 1 ? 4 : a === 2 ? 0.3 : 1)), rng);
    return weighted(l, l.map((a) => (a <= 1 ? 3 : 1)), rng);
  },
  greedy: greedyBot,
};

function meta(format: FormatRules, n: number) {
  const rng = mulberry32(4242);
  const names = Object.keys(ARCH);
  const M: number[][] = names.map(() => names.map(() => 0.5));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      let w = 0;
      for (let k = 0; k < n; k++) {
        const la = randomLoadout(rng, format);
        const lb = randomLoadout(rng, format);
        const l1 = playBout(format, la, lb, ARCH[names[i]!]!, ARCH[names[j]!]!, rng).final.result!;
        const l2 = playBout(format, lb, la, ARCH[names[j]!]!, ARCH[names[i]!]!, rng).final.result!;
        w += (l1.winner === 0 ? 1 : l1.winner === 2 ? 0.5 : 0) + (l2.winner === 1 ? 1 : l2.winner === 2 ? 0.5 : 0);
      }
      M[i]![j] = w / (2 * n);
      M[j]![i] = 1 - M[i]![j]!;
    }
  }
  const sol = solveGame(M.map((r) => r.map((v) => v - 0.5)), 3000);
  console.log(`
=== META · ${format.name} · ${names.length} archetypes, ${n * 2} bouts per pair (row win rate vs column)`);
  console.log("".padEnd(10) + names.map((x) => x.slice(0, 7).padStart(8)).join(""));
  names.forEach((nm, i) => console.log(nm.padEnd(10) + M[i]!.map((v) => (v * 100).toFixed(0).padStart(7) + "%").join("") + `   mean ${(M[i]!.reduce((a, b) => a + b, 0) / names.length * 100).toFixed(0)}%`));
  console.log("equilibrium mix over archetypes:", names.map((nm, i) => `${nm} ${(sol.x[i]! * 100).toFixed(0)}%`).join("  "), ` value ${(sol.value * 100 + 50).toFixed(1)}%`);
  const dom = names.filter((_, i) => names.every((__, j) => i === j || M[i]![j]! >= 0.5));
  console.log(dom.length ? `⚠ DOMINANT archetype(s): ${dom.join(", ")}` : "no archetype beats or ties every other (good)");
  const cycles = names.flatMap((a, i) => names.flatMap((b, j) => names.filter((_, k) => i < j && j < k && 0).length ? [] : []));
  void cycles;
  return { M, names, sol };
}

/* ------------------------------------------------------------------ */
/* Tool validation + exploitability + variant scoreboard               */
/* ------------------------------------------------------------------ */

/** Samples from the depth-limited equilibrium mix (the "analyser" turned into a player). */
const eqDepthBot = (depth: number, iters = 400): Bot => (st, side, rng) => {
  const g = stateGame(st, side, depth);
  const sol = solveGame(g.M, iters);
  let r = rng();
  for (let i = 0; i < g.mine.length; i++) {
    r -= sol.x[i]!;
    if (r <= 0) return g.mine[i]!;
  }
  return g.mine[g.mine.length - 1]!;
};

/** Best responder that KNOWS the opponent's decision procedure (not its random draws): samples it, best-responds. */
function modelBR(opp: Bot, samples = 12): Bot {
  return (st, side, rng) => {
    const o = (1 - side) as Side;
    const mine = legalActions(st, side);
    const draws: number[] = [];
    for (let i = 0; i < samples; i++) draws.push(opp(st, o, mulberry32(Math.floor(rng() * 1e9))));
    let best = -Infinity;
    let bi = 0;
    mine.forEach((a, i) => {
      let v = 0;
      for (const b of draws) {
        const out = side === 0 ? resolveTurn(st, a, b) : resolveTurn(st, b, a);
        v += evalState(out.state, side);
      }
      if (v > best) {
        best = v;
        bi = i;
      }
    });
    return mine[bi]!;
  };
}

/** win rate of A vs B over n loadout pairs, both seats */
function seatedWin(format: FormatRules, A: Bot, B: Bot, n: number, rng: Rng): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const la = randomLoadout(rng, format);
    const lb = randomLoadout(rng, format);
    const r1 = playBout(format, la, lb, A, B, rng).final.result!;
    const r2 = playBout(format, lb, la, B, A, rng).final.result!;
    w += (r1.winner === 0 ? 1 : r1.winner === 2 ? 0.5 : 0) + (r2.winner === 1 ? 1 : r2.winner === 2 ? 0.5 : 0);
  }
  return w / (2 * n);
}

function check(format: FormatRules, n: number) {
  const rng = mulberry32(555);
  console.log(`\n=== TOOL CHECK · ${format.name}`);
  // (a) does the analyser play well?
  const d2 = eqDepthBot(2, 250);
  const d1 = eqDepthBot(1, 400);
  console.log(`(a) depth-1 eq bot  v greedy : ${(seatedWin(format, d1, greedyBot, n, rng) * 100).toFixed(1)}%`);
  console.log(`    depth-2 eq bot  v greedy : ${(seatedWin(format, d2, greedyBot, Math.max(10, Math.floor(n / 3)), rng) * 100).toFixed(1)}%   (≈50% or better → the analyser's mixes are sound)`);
  // (b) solver convergence on sampled states
  const states = collectStates(format, 16, rng);
  let tvSum = 0;
  let gapLo = 0;
  let gapHi = 0;
  for (const { st, side } of states) {
    const g = stateGame(st, side, 2);
    const lo = solveGame(g.M, 250);
    const hi = solveGame(g.M, 3000);
    let d = 0;
    lo.x.forEach((v, i) => (d += Math.abs(v - hi.x[i]!)));
    tvSum += d / 2;
    const gap = (sol: { x: number[] }) => {
      let worst = Infinity;
      for (let j = 0; j < g.theirs.length; j++) {
        let v = 0;
        for (let i = 0; i < g.mine.length; i++) v += sol.x[i]! * g.M[i]![j]!;
        worst = Math.min(worst, v);
      }
      return hi.value - worst; // how far below the converged value the strategy is guaranteed
    };
    gapLo += gap(lo);
    gapHi += gap(hi);
  }
  console.log(`(b) solver convergence over ${states.length} states: mean TV(250 vs 3000 iters) = ${(tvSum / states.length).toFixed(3)}   mean guarantee gap @250 = ${(gapLo / states.length).toFixed(1)}  @3000 = ${(gapHi / states.length).toFixed(1)}   (value scale ±1000)`);
  // (c) exploitability
  const vsGreedy = seatedWin(format, modelBR(greedyBot), greedyBot, Math.max(20, Math.floor(n / 2)), rng);
  const vsEq1 = seatedWin(format, modelBR(d1, 8), d1, Math.max(12, Math.floor(n / 4)), rng);
  console.log(`(c) model-based best response wins ${(vsGreedy * 100).toFixed(1)}% vs greedy (≈deterministic) and ${(vsEq1 * 100).toFixed(1)}% vs the mixed depth-1 eq bot → exploitability gap ${((vsGreedy - vsEq1) * 100).toFixed(1)} pts`);
}

interface Variant {
  name: string;
  flags: Partial<import("./types").RuleFlags>;
}
const VARIANTS: Variant[] = [
  { name: "base", flags: {} },
  { name: "E1", flags: { braceGainIfUnattacked: true } },
  { name: "E2", flags: { switchRefundIfUnattacked: true } },
  { name: "E3", flags: { guardTriangle: true } },
  { name: "E1+E2", flags: { braceGainIfUnattacked: true, switchRefundIfUnattacked: true } },
  { name: "E2+E3", flags: { switchRefundIfUnattacked: true, guardTriangle: true } },
  { name: "E1+E2+E3", flags: { braceGainIfUnattacked: true, switchRefundIfUnattacked: true, guardTriangle: true } },
];

function pacing(format: FormatRules, bot: Bot, n: number, rng: Rng) {
  let turns = 0, ko = 0, dko = 0, draw = 0;
  for (let i = 0; i < n; i++) {
    const log = playBout(format, randomLoadout(rng, format), randomLoadout(rng, format), bot, bot, rng);
    turns += log.turns;
    if (log.final.result!.reason === "ko") ko++;
    if (log.final.result!.reason === "draw") draw++;
    if (log.doubleKo) dko++;
  }
  return { turns: turns / n, ko: ko / n, dko: dko / n, draw: draw / n };
}

function variants(states: number, which: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const v of VARIANTS) {
    if (which.length && !which.includes(v.name)) continue;
    for (const base of [LITE, FULL]) {
      const f = withRules(base, v.flags);
      const rng = mulberry32(9);
      const m = r12(f, states, true);
      const p = pacing(f, greedyBot, 80, rng);
      const d1 = eqDepthBot(1, 300);
      const vsG = seatedWin(f, modelBR(greedyBot), greedyBot, 30, rng);
      const vsE = seatedWin(f, modelBR(d1, 6), d1, 12, rng);
      const names = Object.keys(ARCH).filter((x) => x !== "greedy");
      const mean = names.map((a) => {
        let w = 0;
        let c = 0;
        for (const b of names) {
          if (a === b) continue;
          w += seatedWin(f, ARCH[a]!, ARCH[b]!, 25, rng);
          c++;
        }
        return w / c;
      });
      rows.push({
        variant: v.name,
        fmt: base.id === 0 ? "Lite" : "Full",
        pure: `${(m.pureShare * 100).toFixed(0)}%`,
        "≥2live": `${(m.support2 * 100).toFixed(0)}%`,
        "≥3": `${(m.support3 * 100).toFixed(0)}%`,
        tvGrit: m.tvGrit.toFixed(2),
        tvPos: m.tvPos.toFixed(2),
        tvTrick: m.tvTrick.toFixed(2),
        turns: p.turns.toFixed(1),
        koFin: `${(p.ko * 100).toFixed(0)}%`,
        dKO: `${(p.dko * 100).toFixed(0)}%`,
        exploit: `${((vsG - vsE) * 100).toFixed(0)}pt`,
        "BR>greedy": `${(vsG * 100).toFixed(0)}%`,
        archMin: `${(Math.min(...mean) * 100).toFixed(0)}%`,
        archMax: `${(Math.max(...mean) * 100).toFixed(0)}%`,
      });
      console.log("done", v.name, base.name);
    }
  }
  console.table(rows);
}

/* ------------------------------------------------------------------ */
const nz = (d: number) => (Number.isFinite(arg) ? arg : d);
if (cmd === "r12" || cmd === "all") {
  r12(LITE, nz(120));
  r12(FULL, nz(90));
}
if (cmd === "r3" || cmd === "all") {
  r3(LITE, nz(150));
  r3(FULL, nz(100));
}
if (cmd === "check") {
  check(LITE, nz(60));
  check(FULL, nz(30));
}
if (cmd === "variants") {
  variants(nz(60), process.argv.slice(4));
}
if (cmd === "meta" || cmd === "all") {
  meta(LITE, nz(120));
  meta(FULL, nz(80));
}
if (cmd === "r6" || cmd === "all") {
  r6(LITE, nz(60));
}
