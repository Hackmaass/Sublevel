"use client";

/**
 * THE ROOM (mock backend) — "the room reads the fight".
 * Spectators predict, per fighter, the KIND of move that comes next (LIGHT / HEAVY / BRACE / SWITCH / TRICK). Correct reads score
 * points. Nothing here can influence a bout: this store only READS `useGame`, and it is never read by the game store.
 *
 * It deliberately mimics the on-chain protocol so the UX is tested honestly before any contract exists:
 *  • predictions are sealed (kept out of React state) while the window is open — the fighters never see the crowd's call;
 *  • the window is open while both fighters are still committing, and closes once the opponent has locked;
 *  • a turn's predictions are REVEALED one turn late (when the next window opens, or when the bout ends) and only then scored.
 */
import { create } from "zustand";
import {
  CLASS_COUNT,
  PC,
  actualClasses,
  classOf,
  eqBot,
  greedyBot,
  habitBot,
  mulberry32,
  roomAccuracy,
  roomRead,
  scoreTurn,
  tally,
  type BoutState,
  type Heat,
  type PredClass,
  type Prediction,
  type Rng,
  type RoomTurn,
} from "@sublevel/engine";
import { SLOW, useGame } from "./game";

export interface Spectator {
  id: string;
  name: string;
  points: number;
  human: boolean;
  /** turns whose reveal this spectator took part in */
  seen: number;
}

export interface RoomTurnRec extends RoomTurn {
  /** index into the bout's history */
  turn: number;
}

export interface Roar {
  id: number;
  side: 0 | 1;
  pct: number;
}

interface RoomState {
  on: boolean;
  spectators: Spectator[];
  windowOpen: boolean;
  /** the room code phones scan/type to join this screen */
  code: string;
  /** whether the relay (the Next server) answered the last publish */
  relay: "unknown" | "online" | "offline";
  /** the big, background-dimmed "scan to join" QR is open (a first-time intro, or on demand); it closes once a phone has joined */
  qrBig: boolean;
  toggleQr(): void;
  /** bumps for every new bout, so a phone never mistakes a rematch's turn 0 for the old one */
  epoch: number;
  /** the history index the open (or last) window belongs to */
  windowTurn: number;
  /** how many have locked a prediction in this window (the COUNT is public; the picks are not) */
  locked: number;
  /** revealed turns of the current bout */
  turns: RoomTurnRec[];
  roar: Roar | null;
  /** id → points earned at the last reveal (lets a phone show "you read 1 of 2") */
  lastResults: Record<string, number>;
  toggle(): void;
  join(id: string, name: string): void;
  /** a human spectator's pick; false if the window is shut, the turn is stale or they already locked */
  submit(id: string, turn: number, pred: Prediction): boolean;
}

type Skill = "eq" | "greedy" | "habit" | "noise";
const NAMES = ["Crow", "Static", "Nine", "Mags", "Ferro", "Big Linh", "Dock", "Sweeney", "Pilot", "Vex", "Tin", "Marrow", "Hush", "Gasket", "Rook", "Oz", "Bellows", "Wick", "Dogtag", "Sable", "Knox", "Moth", "Pike", "Juno"];
const SKILLS: Skill[] = ["eq", "greedy", "habit", "noise", "habit", "greedy"];

const makeBots = (): Spectator[] => NAMES.map((name, i) => ({ id: `bot:${i}`, name, points: 0, human: false, seen: 0 }));
const skillOf = (id: string): Skill => SKILLS[Number(id.split(":")[1]) % SKILLS.length]!;

/** sealed predictions: kept OUT of the store on purpose, so no component can render the crowd's call before the reveal */
const sealed = new Map<number, Map<string, Prediction>>();
let timers: ReturnType<typeof setTimeout>[] = [];
let rng: Rng = mulberry32(Date.now() % 100000);
let roarId = 1;
/** the state at the start of the open window (what a spectator watching the table sees) */
let windowBefore: BoutState | null = null;
let windowOpenedAt = 0;
/** per-window measurements (how long it stayed open, how many picks it collected) — exposed in dev for tests */
export const windowStats: { turn: number; openMs: number; picks: number }[] = [];

const sleepScaled = (ms: number) => ms * SLOW;

function botPick(skill: Skill, before: BoutState): Prediction {
  if (skill === "noise") return [Math.floor(rng() * CLASS_COUNT) as PredClass, Math.floor(rng() * CLASS_COUNT) as PredClass];
  const bot = skill === "eq" ? eqBot : skill === "greedy" ? greedyBot : habitBot;
  return [classOf(before, 0, bot(before, 0, rng)), classOf(before, 1, bot(before, 1, rng))];
}

export const useRoom = create<RoomState>((set, get) => ({
  on: true,
  spectators: makeBots(),
  windowOpen: false,
  code: "",
  relay: "unknown",
  qrBig: false,
  toggleQr: () => set((s) => ({ qrBig: !s.qrBig })),
  epoch: 0,
  windowTurn: 0,
  locked: 0,
  turns: [],
  roar: null,
  lastResults: {},
  toggle: () => set((s) => ({ on: !s.on })),
  join(id, name) {
    if (get().spectators.some((s) => s.id === id)) {
      set((s) => ({ spectators: s.spectators.map((x) => (x.id === id ? { ...x, name } : x)) }));
      return;
    }
    // the first phone through the door: the big QR has done its job and steps aside
    set((s) => ({ qrBig: false, spectators: [...s.spectators, { id, name, points: 0, human: true, seen: 0 }] }));
  },
  submit(id, turn, pred) {
    const s = get();
    if (!s.windowOpen || turn !== s.windowTurn || !s.spectators.some((x) => x.id === id)) return false;
    const bucket = sealed.get(turn) ?? new Map<string, Prediction>();
    if (bucket.has(id)) return false; // write-once, like a commit
    bucket.set(id, pred);
    sealed.set(turn, bucket);
    set({ locked: bucket.size });
    return true;
  },
}));

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function openWindow(turn: number, before: BoutState) {
  clearTimers();
  windowBefore = before;
  windowOpenedAt = performance.now();
  sealed.set(turn, sealed.get(turn) ?? new Map());
  useRoom.setState({ windowOpen: true, windowTurn: turn, locked: sealed.get(turn)!.size });
  for (const sp of useRoom.getState().spectators) {
    if (sp.human) continue;
    const delay = sleepScaled(350 + rng() * 3200);
    timers.push(
      setTimeout(() => {
        if (!useRoom.getState().windowOpen || useRoom.getState().windowTurn !== turn || !windowBefore) return;
        useRoom.getState().submit(sp.id, turn, botPick(skillOf(sp.id), windowBefore));
      }, delay),
    );
  }
}

function closeWindow() {
  clearTimers();
  const room = useRoom.getState();
  if (room.windowOpen) {
    windowStats.push({ turn: room.windowTurn, openMs: Math.round(performance.now() - windowOpenedAt), picks: sealed.get(room.windowTurn)?.size ?? 0 });
    useRoom.setState({ windowOpen: false });
  }
}

/** reveal and score every sealed turn strictly before `upTo` (or all of them when upTo is Infinity) */
function revealUpTo(upTo: number) {
  const history = useGame.getState().history;
  for (const turn of [...sealed.keys()].sort((a, b) => a - b)) {
    if (turn >= upTo) continue;
    const rec = history[turn];
    const bucket = sealed.get(turn);
    sealed.delete(turn);
    if (!rec || !bucket || bucket.size === 0) continue;
    const actual = actualClasses(rec.before, rec.actions);
    const preds = [...bucket.values()];
    const heat: Heat = tally(preds);
    const results: Record<string, number> = {};
    useRoom.setState((s) => ({
      turns: [...s.turns, { turn, heat, actual }],
      spectators: s.spectators.map((sp) => {
        const p = bucket.get(sp.id);
        if (!p) return sp;
        const pts = scoreTurn(p, actual);
        results[sp.id] = pts;
        return { ...sp, points: sp.points + pts, seen: sp.seen + 1 };
      }),
      lastResults: results,
    }));
    for (const side of [0, 1] as const) {
      const pct = roomAccuracy(heat[side]!, actual[side]!);
      if (pct >= 0.6) {
        useRoom.setState({ roar: { id: roarId++, side, pct } });
        break;
      }
    }
  }
}

function resetBout() {
  clearTimers();
  sealed.clear();
  windowBefore = null;
  useRoom.setState((s) => ({ windowOpen: false, epoch: s.epoch + 1, windowTurn: 0, locked: 0, turns: [], roar: null, lastResults: {} }));
}

/** Wire the room to the game. Call once from the match screen; returns the unsubscribe. */
export function startRoom(): () => void {
  rng = mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  const unsub = useGame.subscribe((s, prev) => {
    if (s.tutorial) {
      if (useRoom.getState().windowOpen || sealed.size) resetBout();
      return;
    }
    // a fresh bout (first start, rematch, or leaving and coming back)
    const fresh = s.bout && s.history.length === 0 && s.stage === "choose" && (prev.screen !== "match" || prev.history.length > 0 || prev.bout !== s.bout);
    if (fresh) resetBout();
    const choosing = s.stage === "choose";
    const oppStillCommitting = s.stage === "waiting" && !s.oppLocked;
    const windowShouldBeOpen = !!s.bout && s.bout.phase === "turn" && (choosing || oppStillCommitting);
    const room = useRoom.getState();
    if (windowShouldBeOpen && s.bout) {
      const turn = s.history.length;
      if (!room.windowOpen || room.windowTurn !== turn) {
        revealUpTo(turn); // the previous turn's picks are revealed as the next window opens
        openWindow(turn, s.bout);
      }
    } else if (room.windowOpen) closeWindow();
    if (s.stage === "over" && prev.stage !== "over") revealUpTo(Infinity);
  });
  return () => {
    unsub();
    resetBout();
  };
}

/** "the room read you on N of M turns" for the bout that just ended (side 0 = you) */
export function roomReadLine(turns: RoomTurnRec[], boutTurns: number): { you: number; them: number; of: number } {
  const r = roomRead(turns);
  // a turn nobody predicted (the window was too short) is a turn the room did not read: count it in the denominator
  return { you: r.read[0], them: r.read[1], of: Math.max(boutTurns, r.of) };
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__sublevelRoom = { store: useRoom, windowStats };
}

export { PC };
