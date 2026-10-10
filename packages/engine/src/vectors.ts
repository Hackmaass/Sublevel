/**
 * Emit cross-language test vectors:  pnpm --filter @sublevel/engine vectors
 * Solidity's Engine must reproduce every `next` state and event list exactly.
 *
 * Output: packages/engine/vectors/engine-vectors.txt — one case per line:
 *   T <fmt> <actionA> <actionB> <stateHex> <nextHex> <eventsHex> <legalAHex> <legalBHex>   (legal lists in TS order)
 *   R <fmt> <choiceA> <choiceB> <stateHex> <nextHex> <eventsHex>                           (replacement phase)
 * Hex = packed int16[] (see encode.ts).
 *
 * COVERAGE GATE: the generator keeps playing diverse policies until every rule path below has been exercised
 * (guard break / block / interrupt, every trick incl. Sucker Punch hit+miss, free switch, double KO → sudden death → KO and → draw,
 * turn-cap decision, replacement…) and exits non-zero if any path is missing, so the vector set can't silently go thin.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyReplacements, createBout, legalActions, needsReplacement, resolveTurn } from "./engine";
import { allBuilds, randomLoadout } from "./builds";
import { chooseReplacement, habitBot, randomBot, type Bot } from "./bots";
import { mulberry32 } from "./rng";
import { FULL, LITE, RULEBOOK_VERSION } from "./rulebook";
import { encodeEvents, encodeState, packHex } from "./encode";
import type { BoutState, GameEvent } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../vectors");
const out = resolve(dir, "engine-vectors.txt");

const rng = mulberry32(2024);
const lines: string[] = [`# rulebook ${RULEBOOK_VERSION}`];
const seen = new Map<string, number>();
const hit = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);

/* policies with different appetites so rare paths actually occur */
const lover = (wa: number, wb: number, ws: number, wt: number): Bot => (st, side, r) => {
  const l = legalActions(st, side);
  const w = l.map((a) => (a <= 1 ? wa : a === 2 ? wb : a <= 5 ? ws : wt));
  let x = r() * w.reduce((p, q) => p + q, 0);
  for (let i = 0; i < l.length; i++) {
    x -= w[i]!;
    if (x <= 0) return l[i]!;
  }
  return l[l.length - 1]!;
};
const POLICIES: Bot[] = [randomBot, habitBot, lover(8, 1, 0.3, 1), lover(1, 6, 1, 1), lover(2, 1, 6, 1), lover(2, 1, 0.5, 8), lover(5, 3, 1, 2)];

function tally(ev: GameEvent[], st: BoutState, next: BoutState) {
  for (const e of ev) {
    if (e.t === "switch") hit(e.refunded ? "switch:free(refunded)" : "switch:paid");
    else if (e.t === "trick") {
      hit(`trick:${e.trick}`);
      if (e.trick === 4) hit((e.amount ?? 0) > 0 ? "trick:4:suckerHit" : "trick:4:suckerMiss");
    } else if (e.t === "attack") {
      hit(`attack:adv${e.adv}`);
      for (const k of ["braced", "smoked", "countered", "nullified", "blocked", "guardBroken", "interrupted"] as const) if (e[k]) hit(`attack:${k}`);
      if (e.dmg === 0) hit("attack:zeroDamage");
    } else if (e.t === "brace") hit(`brace:gain${e.gained}`);
    else if (e.t === "ko") hit("ko");
    else if (e.t === "replace") hit("replace");
    else if (e.t === "sudden") hit("sudden");
    else if (e.t === "end") hit(`end:${e.result.reason}:w${e.result.winner}`);
  }
  if (next.sudden && next.phase === "over") hit("suddenDeath:ended");
  if (st.sudden) hit("turnInSuddenDeath");
  if (next.phase === "over" && next.result?.reason === "decision") hit("decision");
}

const REQUIRED = [
  "switch:free(refunded)", "switch:paid", "trick:0", "trick:1", "trick:2", "trick:3", "trick:4", "trick:4:suckerHit", "trick:4:suckerMiss", "trick:5",
  "attack:adv-1", "attack:adv0", "attack:adv1", "attack:braced", "attack:smoked", "attack:countered", "attack:nullified", "attack:blocked", "attack:guardBroken", "attack:interrupted", "attack:zeroDamage",
  "brace:gain0", "brace:gain1", "ko", "replace", "sudden", "turnInSuddenDeath", "suddenDeath:ended", "decision",
  "end:ko:w0", "end:ko:w1", "end:draw:w2", "end:decision:w0", "end:decision:w1",
];
const missing = () => REQUIRED.filter((k) => !seen.has(k));

function playOne(format: typeof LITE, bots: [Bot, Bot]) {
  let st = createBout(format, randomLoadout(rng, format), randomLoadout(rng, format));
  let guard = 0;
  while (st.phase !== "over" && guard++ < 60) {
    if (st.phase === "replace") {
      const need = needsReplacement(st);
      const choices: [number, number] = [need[0] ? chooseReplacement(st, 0, rng) : 0, need[1] ? chooseReplacement(st, 1, rng) : 0];
      const o = applyReplacements(st, choices);
      lines.push(`R ${format.id} ${choices[0]} ${choices[1]} ${packHex(encodeState(st))} ${packHex(encodeState(o.state))} ${packHex(encodeEvents(o.events))}`);
      tally(o.events, st, o.state);
      st = o.state;
      continue;
    }
    const a = bots[0](st, 0, rng);
    const b = bots[1](st, 1, rng);
    const o = resolveTurn(st, a, b);
    lines.push(`T ${format.id} ${a} ${b} ${packHex(encodeState(st))} ${packHex(encodeState(o.state))} ${packHex(encodeEvents(o.events))} ${packHex(legalActions(st, 0))} ${packHex(legalActions(st, 1))}`);
    tally(o.events, st, o.state);
    st = o.state;
  }
}

// base pass: every format × every pair of policies
for (const format of [LITE, FULL]) {
  for (let i = 0; i < POLICIES.length; i++) for (let j = 0; j < POLICIES.length; j++) for (let n = 0; n < 2; n++) playOne(format, [POLICIES[i]!, POLICIES[j]!]);
}
// top-up until every required rule path has been exercised
for (let round = 0; round < 40 && missing().length; round++) {
  for (const format of [LITE, FULL]) for (let n = 0; n < 30; n++) playOne(format, [POLICIES[Math.floor(rng() * POLICIES.length)]!, POLICIES[Math.floor(rng() * POLICIES.length)]!]);
}


/* ---------------- BOUT SCRIPTS: whole bouts played through the real contracts (cards → pools → Arena) ----------------
 *   B <fmt> <leadA> <leadB> <poolA> <poolB> <script> <finalStateHex> [<selA> <selB>]
 *   pool   = comma list of  F:style:atk0:atk1:spread  |  K:trickId        (in registration order)
 *   Lite   : the loadout is the first `fighters` fighters and first `tricks` tricks (no sel fields)
 *   Full   : sel = 5 comma-separated pool indexes, one per hidden slot (slots 0–2 fighters, 3–4 tricks). The player's hand is
 *            therefore a random 3-of-N fighters + 2-of-M tricks in a random order — the contracts must honour the selection.
 *   script = ';'-separated steps  T:a:b  (turn actions)  |  R:c0:c1  (replacement choices; only the sides that must choose are used)
 */
const boutLines: string[] = [];
const builds = allBuilds();
const trickIds = [0, 1, 2, 3, 4, 5];
const descr = (b: { style: number; attackIds: [number, number]; spread: number }) => `F:${b.style}:${b.attackIds[0]}:${b.attackIds[1]}:${b.spread}`;
const shuffled = <T,>(a: T[]): T[] => [...a].sort(() => rng() - 0.5);
/** Which hidden-data pauses (OpenCards phase on-chain) a Full bout runs into.
 *  decision : turn cap reached with tied KOs while some fighter never entered play  -> every unplayed max HP is read
 *  sudden   : both sides reach the KO target on the same turn and some side's first living fighter never entered play */
type Pause = "pause:decision" | "pause:sudden";

function genScript(format: typeof LITE): { line: string; pauses: Set<Pause> } {
  const pauses = new Set<Pause>();
  const full = format.id === 1;
  /* Lite: pool = 2 fighters + 1 trick (the whole pool is the loadout).
   * Full: pool = 8 cards in a RANDOM order (3–5 fighters, 3–5 tricks; ≥3 / ≥2 required); the player secretly picks
   *       3 fighters + 2 tricks and an order for them — `sel` lists the pool index behind each of the 5 slots. */
  const nFighters = full ? 3 + Math.floor(rng() * 3) : 2;
  const nTricks = full ? 8 - nFighters : 1;
  const pools = [0, 1].map(() => {
    const fighters = Array.from({ length: nFighters }, () => builds[Math.floor(rng() * builds.length)]!);
    const tricks = Array.from({ length: nTricks }, () => trickIds[Math.floor(rng() * trickIds.length)]!);
    // registration order of the pool (Lite keeps fighters-then-tricks, which is also the order Arena builds its loadout from)
    const inOrder = [...fighters.map((_, i) => ({ k: "F" as const, i })), ...tricks.map((_, i) => ({ k: "K" as const, i }))];
    const order = full ? shuffled(inOrder) : inOrder;
    let sel: number[] = [];
    if (full) {
      const fIdx = shuffled(order.map((c, p) => (c.k === "F" ? p : -1)).filter((p) => p >= 0)).slice(0, 3);
      const kIdx = shuffled(order.map((c, p) => (c.k === "K" ? p : -1)).filter((p) => p >= 0)).slice(0, 2);
      sel = [...fIdx, ...kIdx];
    }
    return { fighters, tricks, order, sel };
  });
  const lead: [number, number] = [Math.floor(rng() * format.fighters), Math.floor(rng() * format.fighters)];
  const load = (p: (typeof pools)[0], l: number) => {
    if (!full) return { fighters: p.fighters.slice(0, format.fighters), tricks: p.tricks.slice(0, format.tricks), lead: l };
    const cardAt = (pos: number) => p.order[pos]!;
    return { fighters: p.sel.slice(0, 3).map((pos) => p.fighters[cardAt(pos).i]!), tricks: p.sel.slice(3).map((pos) => p.tricks[cardAt(pos).i]!), lead: l };
  };
  let st = createBout(format, load(pools[0]!, lead[0]), load(pools[1]!, lead[1]));
  const bots: [Bot, Bot] = [POLICIES[Math.floor(rng() * POLICIES.length)]!, POLICIES[Math.floor(rng() * POLICIES.length)]!];
  const steps: string[] = [];
  let guard = 0;
  while (st.phase !== "over" && guard++ < 60) {
    if (st.phase === "replace") {
      const need = needsReplacement(st);
      const ch: [number, number] = [need[0] ? chooseReplacement(st, 0, rng) : 0, need[1] ? chooseReplacement(st, 1, rng) : 0];
      steps.push(`R:${ch[0]}:${ch[1]}`);
      st = applyReplacements(st, ch).state;
      continue;
    }
    const a = bots[0](st, 0, rng);
    const b = bots[1](st, 1, rng);
    steps.push(`T:${a}:${b}`);
    const prev = st;
    const o = resolveTurn(st, a, b);
    st = o.state;
    if (full) {
      // a fighter is "opened" on-chain once it has been in play, or was switched in during the turn that just resolved
      const opened = (side: 0 | 1, idx: number) => prev.sides[side].fighters[idx]!.revealed || o.events.some((e) => e.t === "switch" && e.side === side && e.to === idx);
      if (!prev.sudden && st.sudden) {
        // the re-entry picks each side's first living fighter, which is the one that is active afterwards
        for (const side of [0, 1] as const) if (!opened(side, st.sides[side].active)) pauses.add("pause:sudden");
      }
      if (st.phase === "over" && st.result?.reason === "decision" && st.sides[0].kos === st.sides[1].kos) {
        for (const side of [0, 1] as const) if (st.sides[side].fighters.some((_, i) => !opened(side, i))) pauses.add("pause:decision");
      }
    }
  }
  const poolStr = (p: (typeof pools)[0]) => p.order.map((c) => (c.k === "F" ? descr(p.fighters[c.i]!) : `K:${p.tricks[c.i]}`)).join(",");
  const selStr = full ? ` ${pools[0]!.sel.join(",")} ${pools[1]!.sel.join(",")}` : "";
  return { line: `B ${format.id} ${lead[0]} ${lead[1]} ${poolStr(pools[0]!)} ${poolStr(pools[1]!)} ${steps.join(";")} ${packHex(encodeState(st))}${selStr}`, pauses };
}

const pauseSeen = new Map<Pause, number>();
const countPauses = (ps: Set<Pause>) => ps.forEach((p) => pauseSeen.set(p, (pauseSeen.get(p) ?? 0) + 1));
for (const format of [LITE, FULL]) {
  for (let n = 0; n < 40; n++) {
    const g = genScript(format);
    boutLines.push(g.line);
    countPauses(g.pauses);
  }
}
/* COVERAGE GATE (Full): both hidden-data pauses must be exercised by whole-bout replays, else the Solidity pause logic is untested.
 * Top up with extra Full bouts that add a needed pause kind until each was seen at least MIN_PAUSE times. */
const MIN_PAUSE = 3;
const PAUSES: Pause[] = ["pause:decision", "pause:sudden"];
for (let attempt = 0; attempt < 30000 && PAUSES.some((p) => (pauseSeen.get(p) ?? 0) < MIN_PAUSE); attempt++) {
  const g = genScript(FULL);
  if (![...g.pauses].some((p) => (pauseSeen.get(p) ?? 0) < MIN_PAUSE)) continue;
  boutLines.push(g.line);
  countPauses(g.pauses);
}
console.log("full-bout pauses in scripts:", PAUSES.map((p) => `${p}=${pauseSeen.get(p) ?? 0}`).join("  "));
const pauseGap = PAUSES.filter((p) => (pauseSeen.get(p) ?? 0) < MIN_PAUSE);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "bout-scripts.txt"), boutLines.join("\n") + "\n");
console.log(`wrote ${boutLines.length} bout scripts → vectors/bout-scripts.txt`);

rmSync(resolve(dir, "engine-vectors.json"), { force: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${lines.length - 1} vector lines → ${out}`);
const m = missing();
console.log([...seen.entries()].sort().map(([k, v]) => `${k}=${v}`).join("  "));
if (pauseGap.length) {
  console.error("\n✗ COVERAGE GAP — Full bout scripts never hit:", pauseGap.join(", "));
  process.exit(1);
}
if (m.length) {
  console.error("\n✗ COVERAGE GAP — vectors never exercised:", m.join(", "));
  process.exit(1);
}
console.log(`✓ all ${REQUIRED.length} required rule paths covered`);
