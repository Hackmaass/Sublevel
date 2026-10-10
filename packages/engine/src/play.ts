import { applyReplacements, createBout, needsReplacement, resolveTurn } from "./engine";
import { chooseReplacement, type Bot } from "./bots";
import type { Rng } from "./rng";
import type { BoutState, FormatRules, GameEvent, Loadout } from "./types";

export interface BoutLog {
  final: BoutState;
  turns: number;
  events: GameEvent[];
  /** side that scored the first KO, or -1 */
  firstKo: -1 | 0 | 1;
  doubleKo: boolean;
  actionsA: number[];
  actionsB: number[];
}

/** Play a full bout with two bots (simulator/sparring helper). */
export function playBout(format: FormatRules, la: Loadout, lb: Loadout, botA: Bot, botB: Bot, rng: Rng): BoutLog {
  let st = createBout(format, la, lb);
  const events: GameEvent[] = [];
  const actionsA: number[] = [];
  const actionsB: number[] = [];
  let firstKo: -1 | 0 | 1 = -1;
  let doubleKo = false;
  let guard = 0;
  while (st.phase !== "over" && guard++ < 200) {
    if (st.phase === "replace") {
      const need = needsReplacement(st);
      const ca = need[0] ? chooseReplacement(st, 0, rng) : 0;
      const cb = need[1] ? chooseReplacement(st, 1, rng) : 0;
      const out = applyReplacements(st, [ca, cb]);
      st = out.state;
      events.push(...out.events);
      continue;
    }
    const a = botA(st, 0, rng);
    const b = botB(st, 1, rng);
    actionsA.push(a);
    actionsB.push(b);
    const out = resolveTurn(st, a, b);
    st = out.state;
    events.push(...out.events);
    const kos = out.events.filter((e) => e.t === "ko");
    if (kos.length === 2) doubleKo = true;
    if (firstKo === -1 && kos.length === 1) {
      const k = kos[0]!;
      if (k.t === "ko") firstKo = k.by;
    }
  }
  return { final: st, turns: st.turn, events, firstKo, doubleKo, actionsA, actionsB };
}
