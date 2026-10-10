import { A, type Action, type BoutState, type Side } from "./types";
import { ATTACKS, isHeavy } from "./rulebook";
import { isAttack, isSwitch, isTrick } from "./engine";

/**
 * "The room reads the fight" — the pure part. Spectators predict, for each fighter, WHAT KIND of move comes next. The kind is
 * public information only (no hidden card, no exact target), so the same five classes work for Lite and Full and on-chain.
 *
 * NOTHING here can touch a bout: it only reads states and actions that already happened. Points are the only reward.
 */
export const PC = { LIGHT: 0, HEAVY: 1, BRACE: 2, SWITCH: 3, TRICK: 4 } as const;
export type PredClass = (typeof PC)[keyof typeof PC];
export const CLASS_NAMES = ["LIGHT", "HEAVY", "BRACE", "SWITCH", "TRICK"] as const;
export const CLASS_COUNT = 5;

/** [class predicted for side 0's move, class predicted for side 1's move] */
export type Prediction = [PredClass, PredClass];

/** The class of `action` played by `side` on `before` (the state BEFORE the turn: which fighter was active decides LIGHT vs HEAVY). */
export function classOf(before: BoutState, side: Side, action: Action): PredClass {
  if (isAttack(action)) {
    const s = before.sides[side];
    const f = s.fighters[s.active]!;
    const tpl = ATTACKS[f.build.attackIds[action === A.ATTACK1 ? 0 : 1]!]!;
    return isHeavy(tpl.cost) ? PC.HEAVY : PC.LIGHT;
  }
  if (action === A.BRACE) return PC.BRACE;
  if (isSwitch(action)) return PC.SWITCH;
  if (isTrick(action)) return PC.TRICK;
  throw new Error(`unknown action ${action}`);
}

export function actualClasses(before: BoutState, actions: [Action, Action]): Prediction {
  return [classOf(before, 0, actions[0]), classOf(before, 1, actions[1])];
}

/** +1 for every fighter whose move kind was read correctly (0, 1 or 2 per turn). */
export function scoreTurn(pred: Prediction, actual: Prediction): 0 | 1 | 2 {
  return ((pred[0] === actual[0] ? 1 : 0) + (pred[1] === actual[1] ? 1 : 0)) as 0 | 1 | 2;
}

/** counts[side][class] over a set of predictions */
export type Heat = [number[], number[]];

export function tally(preds: Prediction[]): Heat {
  const h: Heat = [new Array(CLASS_COUNT).fill(0), new Array(CLASS_COUNT).fill(0)];
  for (const p of preds) {
    h[0]![p[0]]! += 1;
    h[1]![p[1]]! += 1;
  }
  return h;
}

/** The room's call for one fighter: the single most-picked class, or null on a tie / no votes. */
export function consensus(counts: number[]): PredClass | null {
  let best = -1;
  let bestN = 0;
  let tie = false;
  counts.forEach((n, i) => {
    if (n > bestN) {
      best = i;
      bestN = n;
      tie = false;
    } else if (n === bestN && n > 0) tie = true;
  });
  return best < 0 || tie ? null : (best as PredClass);
}

/** Share of the room (0–1) that read this fighter's move correctly. */
export function roomAccuracy(counts: number[], actual: PredClass): number {
  const total = counts.reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : (counts[actual] ?? 0) / total;
}

export interface RoomTurn {
  heat: Heat;
  actual: Prediction;
}

/** For each side: in how many of the turns did the room's consensus call that fighter's move? (the "room read you on N of M turns" line) */
export function roomRead(turns: RoomTurn[]): { read: [number, number]; of: number } {
  const read: [number, number] = [0, 0];
  for (const t of turns) {
    for (const s of [0, 1] as const) if (consensus(t.heat[s]!) === t.actual[s]) read[s] += 1;
  }
  return { read, of: turns.length };
}
