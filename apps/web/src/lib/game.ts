"use client";

/**
 * Client game store — drives a local (mock/sparring) bout with the shared engine.
 * The renderers (2D view, The Table) only READ this store; they never run rules.
 * When the chain is wired, this store's `submit` swaps to commit/reveal txs; the UI is unchanged.
 */
import { useMemo } from "react";
import { create } from "zustand";
import {
  A,
  FULL,
  LITE,
  PRESETS,
  TRICKS,
  applyReplacements,
  chooseReplacement,
  createBout,
  encodeState,
  eqBot,
  greedyBot,
  habitBot,
  legalActions,
  legalReplacements,
  mulberry32,
  needsReplacement,
  resolveTurn,
  viewFor,
  type Action,
  type BoutState,
  type Bot,
  type FormatRules,
  type GameEvent,
  type Loadout,
  type TurnOutcome,
  type Side,
  TUTORIAL_FORMAT,
  TUTORIAL_LOADOUTS,
  TUTORIAL_NAMES,
  TUTORIAL_SEEDS,
  TUTORIAL_STEPS,
  tutorialBot,
} from "@sublevel/engine";
import { sfx } from "./sfx";
import { markTutorialDone } from "./tutorial";

export type Stage = "setup" | "choose" | "waiting" | "reveal" | "replace" | "over";
export type Difficulty = "rookie" | "regular" | "veteran";

/**
 * A bout whose moves go through the Arena contract instead of a local bot. The table, the reveal animation and the room don't know
 * the difference: `runTurn` asks the driver for the opponent's action and the AUTHORITATIVE state, then plays the same animation.
 */
export interface ChainDriver {
  /** seal + reveal one turn through the Arena; resolves with the opponent's revealed action and the state the CONTRACT holds */
  playTurn(before: BoutState, mine: Action, hooks: { onOppLocked(): void }): Promise<{ mine: Action; theirs: Action; state: BoutState }>;
  /** Lite sudden death: bring in the last fighter (a sealed replacement, like any other move) */
  replace(state: BoutState, slot: number): Promise<BoutState>;
}

export interface Fx {
  id: number;
  kind: "hit" | "heal" | "ko" | "brace" | "switch" | "trick" | "sudden" | "grit";
  side: Side; // who it happened TO (for hit) / who did it (others)
  value?: number;
  adv?: -1 | 0 | 1;
  text?: string;
  at: number;
}

export interface TurnRecord {
  turn: number;
  /** the bout BEFORE this turn resolved (names the chosen actions in the post-bout tape) */
  before: BoutState;
  actions: [Action, Action];
  events: GameEvent[];
}

export interface RevealInfo {
  /** the bout BEFORE this turn resolved (for describing the chosen actions) */
  before: BoutState;
  actions: [Action, Action];
  /** 0 = tokens down (hidden), 1 = flipped, 2 = impacts landed */
  step: 0 | 1 | 2;
  events: GameEvent[];
}

interface Store {
  screen: "title" | "lobby" | "match";
  format: FormatRules;
  difficulty: Difficulty;
  /** authoritative bout */
  bout: BoutState | null;
  /** what the player sees (lags `bout` until impact lands) */
  shown: BoutState | null;
  stage: Stage;
  selected: Action | null;
  locked: Action | null;
  oppLocked: boolean;
  turnEndsAt: number;
  reveal: RevealInfo | null;
  history: TurnRecord[];
  fx: Fx[];
  /** names/portraits seeds for display */
  meta: { name: [string[], string[]]; seed: [number[], number[]] };
  banner: string | null;
  muted: boolean;
  reduceMotion: boolean;
  renderer: "table" | "flat";
  quality: "high" | "low";
  manualOpen: boolean;
  /** the scripted first fight: which lesson, and whether the coach is waiting for "got it" after the turn landed */
  tutorial: { lesson: number; debrief: boolean } | null;
  /** set when this bout is being played through the contracts */
  chain: ChainDriver | null;
  /** the contract and the TypeScript engine disagreed about a turn (should never happen; shown loudly if it does) */
  chainMismatch: number;
  /** bumps when the player picks a move the current lesson doesn't allow (the coach reacts) */
  nudge: number;

  openManual(): void;
  closeManual(): void;
  goLobby(): void;
  goTitle(): void;
  startChainMatch(bout: BoutState, names: [string[], string[]], seeds: [number[], number[]], driver: ChainDriver): void;
  startTutorial(): void;
  tutorialContinue(): void;
  leaveTutorial(to: "lobby" | "title" | "fight"): void;
  startMatch(loadout: Loadout, names: string[], seeds: number[], format?: FormatRules): void;
  quickStart(format?: FormatRules): void;
  select(a: Action | null): void;
  lock(): void;
  pickReplacement(slot: number): void;
  setDifficulty(d: Difficulty): void;
  toggleMute(): void;
  toggleReduceMotion(): void;
  setRenderer(r: "table" | "flat"): void;
  setQuality(q: "high" | "low"): void;
  clearFx(id: number): void;
}

/** `?slow=N` stretches every timed animation N× (for capturing frames under a slow software renderer). */
export const SLOW: number = typeof window !== "undefined" ? Math.max(1, Number(new URLSearchParams(window.location.search).get("slow") ?? 1) || 1) : 1;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * SLOW));
let fxId = 1;
let runToken = 0;
let rng = mulberry32(Date.now() % 100000);
/** resolves the turn loop that is parked on the coach's "got it" button */
let continueResolve: (() => void) | null = null;
const releaseContinue = () => {
  const r = continueResolve;
  continueResolve = null;
  r?.();
};

const TURN_SECONDS = 20;

function botFor(d: Difficulty): Bot {
  if (d === "rookie") return habitBot;
  if (d === "veteran") return eqBot;
  // regular: mostly equilibrium, sometimes human-like noise
  return (st, side, r) => (r() < 0.25 ? habitBot(st, side, r) : r() < 0.4 ? greedyBot(st, side, r) : eqBot(st, side, r));
}

function eventFx(ev: GameEvent[]): Fx[] {
  const now = performance.now();
  const out: Fx[] = [];
  for (const e of ev) {
    if (e.t === "attack") {
      const target = (1 - e.side) as Side;
      const label = e.nullified ? "NO EFFECT" : e.blocked ? "BLOCKED" : e.guardBroken ? "GUARD BROKEN" : e.interrupted ? "INTERRUPTED" : e.braced ? "BRACED" : e.smoked ? "SMOKED" : e.countered ? "COUNTER" : undefined;
      out.push({ id: fxId++, kind: "hit", side: target, value: e.dmg, adv: e.adv, text: label, at: now });
    } else if (e.t === "ko") out.push({ id: fxId++, kind: "ko", side: e.side, at: now });
    else if (e.t === "brace") out.push({ id: fxId++, kind: "brace", side: e.side, value: e.gained, at: now });
    else if (e.t === "switch") out.push({ id: fxId++, kind: "switch", side: e.side, text: e.refunded ? "FREE SWITCH" : undefined, at: now });
    else if (e.t === "trick") {
      if (e.trick === 1) out.push({ id: fxId++, kind: "heal", side: e.side, value: e.amount, at: now });
      else if (e.trick === 0 || e.trick === 4) {
        if ((e.amount ?? 0) > 0 && e.target !== undefined) out.push({ id: fxId++, kind: "hit", side: e.target, value: e.amount, adv: 0, text: e.trick === 0 ? "CHEAP SHOT" : "SUCKER", at: now });
      } else out.push({ id: fxId++, kind: "trick", side: e.side, value: e.amount, text: TRICKS[e.trick]?.name, at: now });
    } else if (e.t === "sudden") out.push({ id: fxId++, kind: "sudden", side: 0, at: now });
  }
  return out;
}

export const useGame = create<Store>((set, get) => ({
  screen: "title",
  format: LITE,
  difficulty: "regular",
  bout: null,
  shown: null,
  stage: "setup",
  selected: null,
  locked: null,
  oppLocked: false,
  turnEndsAt: 0,
  reveal: null,
  history: [],
  fx: [],
  meta: { name: [[], []], seed: [[], []] },
  banner: null,
  muted: false,
  reduceMotion: false,
  renderer: "table",
  quality: "high",
  manualOpen: false,
  tutorial: null,
  chain: null,
  chainMismatch: 0,
  nudge: 0,

  openManual: () => set({ manualOpen: true }),
  closeManual: () => {
    try {
      localStorage.setItem("sublevel.manual.seen", "1");
    } catch {
      /* storage may be unavailable */
    }
    set({ manualOpen: false });
  },
  goLobby: () => {
    set({ screen: "lobby" });
    // first visit: show the house rules once
    try {
      if (!localStorage.getItem("sublevel.manual.seen")) set({ manualOpen: true });
    } catch {
      /* ignore */
    }
  },
  goTitle: () => {
    runToken++;
    releaseContinue();
    sfx.stopDrone();
    set({ screen: "title", bout: null, shown: null, stage: "setup", reveal: null, locked: null, selected: null, fx: [], tutorial: null, chain: null });
  },

  startChainMatch(bout, names, seeds, driver) {
    runToken++;
    releaseContinue();
    rng = mulberry32((Date.now() ^ 0x2c1b3c6d) >>> 0);
    set({
      screen: "match",
      format: bout.format,
      bout,
      shown: bout,
      stage: "choose",
      selected: null,
      locked: null,
      oppLocked: false,
      reveal: null,
      history: [],
      fx: [],
      meta: { name: names, seed: seeds },
      turnEndsAt: 0, // the contract's own phase deadline (90 s) is the clock; no local auto-brace
      banner: "ON-CHAIN",
      tutorial: null,
      chain: driver,
      chainMismatch: 0,
    });
    sfx.startDrone();
    sfx.bell();
    setTimeout(() => get().banner === "ON-CHAIN" && set({ banner: null }), 1600);
  },

  startTutorial() {
    runToken++;
    releaseContinue();
    rng = mulberry32((Date.now() ^ 0x51ed270b) >>> 0);
    const bout = createBout(TUTORIAL_FORMAT, TUTORIAL_LOADOUTS[0], TUTORIAL_LOADOUTS[1]);
    set({
      screen: "match",
      format: TUTORIAL_FORMAT,
      bout,
      shown: bout,
      stage: "choose",
      selected: null,
      locked: null,
      oppLocked: false,
      reveal: null,
      history: [],
      fx: [],
      meta: { name: TUTORIAL_NAMES, seed: TUTORIAL_SEEDS },
      turnEndsAt: 0, // no clock in a lesson
      banner: "LESSON 1",
      tutorial: { lesson: 0, debrief: false },
      nudge: 0,
    });
    sfx.startDrone();
    sfx.bell();
    setTimeout(() => get().banner === "LESSON 1" && set({ banner: null }), 1400);
  },

  tutorialContinue: () => releaseContinue(),

  leaveTutorial(to) {
    runToken++;
    releaseContinue();
    markTutorialDone();
    sfx.stopDrone();
    set({ tutorial: null, chain: null, bout: null, shown: null, stage: "setup", reveal: null, locked: null, selected: null, fx: [] });
    if (to === "fight") get().quickStart();
    else if (to === "lobby") set({ screen: "lobby" });
    else set({ screen: "title" });
  },

  startMatch(loadout, names, seeds, format = get().format) {
    runToken++;
    rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
    // the house fights with named preset fighters (consistent art + names)
    const mine = new Set(seeds.map((x) => x - 1));
    const pool = PRESETS.map((_, i) => i).filter((i) => !mine.has(i));
    const botIdx: number[] = [];
    while (botIdx.length < format.fighters) {
      const i = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      botIdx.push(i);
    }
    const botTricks: number[] = [];
    while (botTricks.length < format.tricks) {
      const t = Math.floor(rng() * TRICKS.length);
      if (!botTricks.includes(t)) botTricks.push(t);
    }
    const botLoad: Loadout = { fighters: botIdx.map((i) => PRESETS[i]!.build), tricks: botTricks, lead: Math.floor(rng() * format.fighters) };
    const botNames = botIdx.map((i) => PRESETS[i]!.name);
    const botSeeds = botIdx.map((i) => i + 1);
    const bout = createBout(format, loadout, botLoad);
    set({
      screen: "match",
      format,
      bout,
      shown: bout,
      stage: "choose",
      selected: null,
      locked: null,
      oppLocked: false,
      reveal: null,
      history: [],
      fx: [],
      meta: { name: [names, botNames], seed: [seeds, botSeeds] },
      turnEndsAt: performance.now() + TURN_SECONDS * 1000,
      banner: "ROUND 1",
      tutorial: null,
      chain: null,
    });
    sfx.startDrone();
    sfx.bell();
    setTimeout(() => get().banner === "ROUND 1" && set({ banner: null }), 1400);
  },

  quickStart(format = get().format) {
    const r2 = mulberry32((Date.now() >>> 0) ^ 0x1234);
    const idx = new Set<number>();
    while (idx.size < format.fighters) idx.add(Math.floor(r2() * PRESETS.length));
    const ids = [...idx];
    const tricks: number[] = [];
    while (tricks.length < format.tricks) {
      const t = Math.floor(r2() * TRICKS.length);
      if (!tricks.includes(t)) tricks.push(t);
    }
    const loadout: Loadout = { fighters: ids.map((i) => PRESETS[i]!.build), tricks, lead: 0 };
    get().startMatch(loadout, ids.map((i) => PRESETS[i]!.name), ids.map((i) => i + 1), format);
  },

  select(a) {
    const s = get();
    if (s.stage !== "choose") return;
    // in a lesson only the scripted move is allowed; anything else makes the coach point at the right one
    if (s.tutorial && a !== null && a !== TUTORIAL_STEPS[s.tutorial.lesson]?.me) {
      set({ nudge: s.nudge + 1 });
      return;
    }
    set({ selected: a });
  },

  lock() {
    const s = get();
    if (s.stage !== "choose" || s.selected === null || !s.bout) return;
    const mine = s.selected;
    if (!legalActions(s.bout, 0).includes(mine)) return;
    sfx.slam();
    set({ locked: mine, stage: "waiting" });
    void runTurn(mine);
  },

  pickReplacement(slot) {
    const s = get();
    if (s.stage !== "replace" || !s.bout) return;
    const bout = s.bout;
    const need = needsReplacement(bout);
    const mine = need[0] ? slot : 0;
    const theirs = need[1] ? chooseReplacement(bout, 1, rng) : 0;
    try {
      const out = applyReplacements(bout, [mine, theirs]);
      sfx.switchIn();
      set({ bout: out.state, shown: out.state, stage: "choose", selected: null, locked: null, oppLocked: false, reveal: null, turnEndsAt: performance.now() + TURN_SECONDS * 1000 });
    } catch {
      /* illegal pick: ignore */
    }
  },

  setDifficulty: (difficulty) => set({ difficulty }),
  toggleMute() {
    const m = !get().muted;
    set({ muted: m });
    import("./sfx").then((x) => x.setMuted(m));
  },
  toggleReduceMotion: () => set({ reduceMotion: !get().reduceMotion }),
  setRenderer: (renderer) => set({ renderer }),
  setQuality: (quality) => set({ quality }),
  clearFx: (id) => set((st) => ({ fx: st.fx.filter((f) => f.id !== id) })),
}));

async function runTurn(mineChosen: Action) {
  let mine = mineChosen;
  const token = ++runToken;
  const st = () => useGame.getState();
  const alive = () => token === runToken;
  const bout0 = st().bout!;
  const driver = st().chain;
  let theirs: Action;
  let out: TurnOutcome;
  if (driver) {
    // ON-CHAIN: seal, wait for the house to seal, reveal, read the result back from the contract
    try {
      const r = await driver.playTurn(bout0, mine, {
        onOppLocked: () => {
          if (!alive()) return;
          useGame.setState({ oppLocked: true });
          sfx.lock();
        },
      });
      if (!alive()) return;
      mine = r.mine; // after a hiccup the move that was ALREADY sealed on chain is the one that counts
      theirs = r.theirs;
      out = resolveTurn(bout0, mine, theirs); // the engine narrates (events for the animation)...
      if (encodeState(out.state).join() !== encodeState(r.state).join()) {
        // ...but the CONTRACT is the authority. A disagreement would be a bug: trust the chain and flag it.
        console.warn("chain/engine mismatch", { engine: out.state, chain: r.state });
        useGame.setState((s) => ({ chainMismatch: s.chainMismatch + 1 }));
        out = { ...out, state: r.state };
      }
    } catch (e) {
      if (!alive()) return;
      console.error(e);
      useGame.setState({ stage: "choose", locked: null, selected: null, oppLocked: false, banner: "CHAIN HICCUP — TRY AGAIN" });
      setTimeout(() => useGame.getState().banner === "CHAIN HICCUP — TRY AGAIN" && useGame.setState({ banner: null }), 2500);
      return;
    }
  } else {
    const bot = st().tutorial ? tutorialBot : botFor(st().difficulty);
    // "thinking" delay: opponent locks in a human-ish time later
    await sleep(500 + Math.floor(rng() * 1100));
    if (!alive()) return;
    theirs = bot(bout0, 1, rng);
    useGame.setState({ oppLocked: true });
    sfx.lock();
    await sleep(350);
    if (!alive()) return;
    out = resolveTurn(bout0, mine, theirs);
  }

  // 0 → silence, tokens down
  useGame.setState({ stage: "reveal", reveal: { before: bout0, actions: [mine, theirs], step: 0, events: out.events } });
  await sleep(900);
  if (!alive()) return;
  // 1 → flip
  sfx.flip();
  useGame.setState({ reveal: { before: bout0, actions: [mine, theirs], step: 1, events: out.events } });
  await sleep(850);
  if (!alive()) return;
  // 2 → impact
  const fxs = eventFx(out.events);
  const big = out.events.some((e) => e.t === "ko");
  let power = 1;
  for (const e of out.events) if (e.t === "attack") power = Math.max(power, 0.6 + e.dmg / 5);
  if (fxs.some((f) => f.kind === "hit")) sfx.hit(power);
  else if (out.events.some((e) => e.t === "brace")) sfx.brace();
  if (out.events.some((e) => e.t === "switch")) setTimeout(() => sfx.switchIn(), 120);
  if (fxs.some((f) => f.kind === "heal")) setTimeout(() => sfx.heal(), 150);
  if (big) setTimeout(() => sfx.ko(), 260);
  if (out.events.some((e) => e.t === "sudden")) sfx.bell(true);

  useGame.setState((s) => ({
    bout: out.state,
    shown: out.state,
    reveal: { before: bout0, actions: [mine, theirs], step: 2, events: out.events },
    fx: [...s.fx, ...fxs],
    history: [...s.history, { turn: out.state.turn, before: bout0, actions: [mine, theirs], events: out.events }],
  }));
  await sleep(big ? 1700 : 1300);
  if (!alive()) return;

  const next = out.state;
  if (st().tutorial && next.phase !== "over") {
    // the coach explains what just happened and waits for "got it"
    useGame.setState((s) => ({ tutorial: s.tutorial && { ...s.tutorial, debrief: true } }));
    await new Promise<void>((r) => (continueResolve = r));
    if (!alive()) return;
  }
  if (next.phase === "over") {
    if (st().tutorial) {
      markTutorialDone();
      try {
        localStorage.setItem("sublevel.manual.seen", "1"); // a graduate doesn't need the rules modal on top of the lesson
      } catch {
        /* storage may be unavailable */
      }
    }
    useGame.setState({ stage: "over", reveal: null });
    sfx.stopDrone();
    return;
  }
  if (next.phase === "replace" && st().chain) {
    // Lite sudden death on chain: the only fighter left re-enters through a sealed replacement, like any other move
    const only = legalReplacements(next, 0);
    try {
      const rep = await st().chain!.replace(next, only[0] ?? 0);
      if (!alive()) return;
      sfx.switchIn();
      useGame.setState({ bout: rep, shown: rep });
      await sleep(400);
      if (!alive()) return;
      beginNextTurn(rep);
    } catch (e) {
      console.error(e);
      useGame.setState({ banner: "CHAIN HICCUP" });
    }
    return;
  }
  if (next.phase === "replace") {
    const need = needsReplacement(next);
    if (!need[0]) {
      // only the bot needs one: do it automatically
      const rep = applyReplacements(next, [0, chooseReplacement(next, 1, rng)]);
      useGame.setState({ bout: rep.state, shown: rep.state });
      await sleep(500);
      if (!alive()) return;
      beginNextTurn(rep.state);
      return;
    }
    const only = legalReplacements(next, 0);
    if (only.length === 1) {
      // nothing to decide: bring in the last fighter automatically
      const rep = applyReplacements(next, [only[0]!, need[1] ? chooseReplacement(next, 1, rng) : 0]);
      sfx.switchIn();
      useGame.setState({ bout: rep.state, shown: rep.state });
      await sleep(600);
      if (!alive()) return;
      beginNextTurn(rep.state);
      return;
    }
    useGame.setState({ stage: "replace", reveal: null, locked: null, selected: null, oppLocked: false });
    return;
  }
  beginNextTurn(next);
}

function beginNextTurn(next: BoutState) {
  const lesson = useGame.getState().tutorial;
  const banner = lesson ? `LESSON ${lesson.lesson + 2}` : `ROUND ${next.turn + 1}`;
  useGame.setState({
    stage: "choose",
    reveal: null,
    selected: null,
    locked: null,
    oppLocked: false,
    turnEndsAt: lesson ? 0 : performance.now() + TURN_SECONDS * 1000,
    banner,
    tutorial: lesson && { lesson: lesson.lesson + 1, debrief: false },
    nudge: 0,
  });
  sfx.tick();
  setTimeout(() => useGame.getState().banner === banner && useGame.setState({ banner: null }), 1100);
}

/** convenience for Full-format hints */
export const legalFor = (b: BoutState | null, side: Side): Action[] => (b ? legalActions(b, side) : []);
export { A, FULL, LITE, PRESETS, TRICKS };

/** The player's redacted view of the bout (Full hides the opponent's unrevealed bench/tricks). */
export function useView(): BoutState | null {
  const shown = useGame((s) => s.shown);
  return useMemo(() => (shown ? viewFor(shown, 0) : null), [shown]);
}
