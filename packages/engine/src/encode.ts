/**
 * Cross-language encoding shared with Solidity (`contracts/src/BoutCodec.sol`).
 *
 * STATE = 88 × int16, big-endian when packed:
 *   [0] fmtId [1] turn [2] phase(0 turn,1 replace,2 over) [3] sudden [4] winner(-1 none,0,1,2 draw) [5] reason(0 ko,1 decision,2 draw,3 forfeit)
 *   then for side s in {0,1}: base = 6 + s*41
 *     +0 nF  +1 active  +2 grit  +3 braceStreak  +4 kos  +5 dealt  +6 last  +7 nT
 *     +8  + i*9 (i<3):  style atk0 atk1 spread maxHp hp retreat revealed alive
 *     +35 + j*3 (j<2):  id used revealed
 *
 * EVENT = 6 × int16 [t, side, a, b, c, d]:
 *   0 switch  (side, from, to, cost, refunded)
 *   1 trick   (side, trick, target|-1, amount|-1, 0)
 *   2 attack  (side, attackId, dmg, targetFighter, flags)  flags = (adv+1) | braced<<2 | smoked<<3 | countered<<4 | nullified<<5 | blocked<<6 | guardBroken<<7 | interrupted<<8
 *   3 brace   (side, gained)
 *   4 ko      (side, fighter, by)
 *   5 replace (side, to)
 *   6 sudden
 *   7 end     (winner, reason)
 */
import { FULL, LITE } from "./rulebook";
import type { BoutState, FighterState, GameEvent, Side, SideState, Style, TrickSlot } from "./types";

export const STATE_LEN = 88;
export const EVENT_LEN = 6;
const REASON = { ko: 0, decision: 1, draw: 2, forfeit: 3 } as const;
const PHASE = { turn: 0, replace: 1, over: 2 } as const;

export function encodeState(st: BoutState): number[] {
  const out: number[] = [st.format.id, st.turn, PHASE[st.phase], st.sudden ? 1 : 0, st.result ? st.result.winner : -1, st.result ? REASON[st.result.reason] : 0];
  for (const s of st.sides) {
    out.push(s.fighters.length, s.active, s.grit, s.braceStreak, s.kos, s.dealt, s.last, s.tricks.length);
    for (let i = 0; i < 3; i++) {
      const f = s.fighters[i];
      if (f) out.push(f.build.style, f.build.attackIds[0], f.build.attackIds[1], f.build.spread, f.maxHp, f.hp, f.retreat, f.revealed ? 1 : 0, f.alive ? 1 : 0);
      else out.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    for (let j = 0; j < 2; j++) {
      const t = s.tricks[j];
      if (t) out.push(t.id, t.used ? 1 : 0, t.revealed ? 1 : 0);
      else out.push(0, 0, 0);
    }
  }
  if (out.length !== STATE_LEN) throw new Error(`state encoding length ${out.length}`);
  return out;
}

export function encodeEvents(events: GameEvent[]): number[] {
  const out: number[] = [];
  for (const e of events) {
    switch (e.t) {
      case "switch":
        out.push(0, e.side, e.from, e.to, e.cost, e.refunded ? 1 : 0);
        break;
      case "trick":
        out.push(1, e.side, e.trick, e.target ?? -1, e.amount ?? -1, 0);
        break;
      case "attack": {
        const flags = e.adv + 1 + ((e.braced ? 1 : 0) << 2) + ((e.smoked ? 1 : 0) << 3) + ((e.countered ? 1 : 0) << 4) + ((e.nullified ? 1 : 0) << 5) + ((e.blocked ? 1 : 0) << 6) + ((e.guardBroken ? 1 : 0) << 7) + ((e.interrupted ? 1 : 0) << 8);
        out.push(2, e.side, e.attack, e.dmg, e.target, flags);
        break;
      }
      case "brace":
        out.push(3, e.side, e.gained, 0, 0, 0);
        break;
      case "ko":
        out.push(4, e.side, e.fighter, e.by, 0, 0);
        break;
      case "replace":
        out.push(5, e.side, e.to, 0, 0, 0);
        break;
      case "sudden":
        out.push(6, 0, 0, 0, 0, 0);
        break;
      case "end":
        out.push(7, e.result.winner, REASON[e.result.reason], 0, 0, 0);
        break;
      default:
        throw new Error(`event not encodable: ${(e as { t: string }).t}`);
    }
  }
  return out;
}

/** int16[] → "0x…" (4 hex chars each, two's complement, big-endian) */
export function packHex(xs: number[]): string {
  return "0x" + xs.map((v) => ((v & 0xffff) >>> 0).toString(16).padStart(4, "0")).join("");
}

/* ======================================================================================================
 * DECODING — the client side of the chain. The Arena stores / emits these exact words.
 * On-chain states can contain things a local bout never has, so the decoder is explicit about them:
 *   phase 3      → the bout is PAUSED until hidden cards are opened (turn-cap decision / sudden-death re-entry)
 *   maxHp 0      → a fighter slot that has not been opened yet (all other stats are 0 — do not render them)
 *   trick id 255 → a trick slot that has not been opened yet
 * A decoded `ChainView.state` is for DISPLAY. Never feed a state with unopened slots to `resolveTurn`.
 * ====================================================================================================== */

export const UNOPENED_TRICK = 255;
const REASONS = ["ko", "decision", "draw", "forfeit"] as const;

export interface ChainView {
  state: BoutState;
  /** phase 3: the Arena is waiting for the sides to open the cards named in `getHidden().need` */
  paused: boolean;
  /** per side: which fighter slots are still hidden placeholders */
  unopened: [boolean[], boolean[]];
  /** per side: which trick slots are still hidden placeholders */
  unopenedTricks: [boolean[], boolean[]];
}

/** "0x…" (4 hex chars per int16, two's complement) → int16[] */
export function unpackHex(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 4 !== 0) throw new Error("unpackHex: length not a multiple of 4");
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 4) {
    const v = parseInt(h.slice(i, i + 4), 16);
    out.push(v >= 0x8000 ? v - 0x10000 : v);
  }
  return out;
}

export function decodeState(w: number[]): ChainView {
  if (w.length !== STATE_LEN) throw new Error(`decodeState: expected ${STATE_LEN} words, got ${w.length}`);
  const format = w[0] === FULL.id ? FULL : LITE;
  if (w[0] !== LITE.id && w[0] !== FULL.id) throw new Error(`decodeState: unknown format ${w[0]}`);
  const paused = w[2] === 3;
  const phase = w[2] === 2 ? "over" : w[2] === 1 ? "replace" : "turn";
  const unopened: [boolean[], boolean[]] = [[], []];
  const unopenedTricks: [boolean[], boolean[]] = [[], []];
  const sides = [0, 1].map((s) => {
    const b = 6 + s * 41;
    const nF = w[b]!;
    const nT = w[b + 7]!;
    const fighters: FighterState[] = [];
    for (let i = 0; i < nF; i++) {
      const o = b + 8 + i * 9;
      const hidden = w[o + 4] === 0; // maxHp 0 = placeholder
      unopened[s]!.push(hidden);
      fighters.push({
        build: { style: w[o]! as Style, attackIds: [w[o + 1]!, w[o + 2]!], spread: w[o + 3]! },
        maxHp: w[o + 4]!,
        hp: w[o + 5]!,
        retreat: w[o + 6]!,
        revealed: w[o + 7] !== 0,
        alive: w[o + 8] !== 0,
      });
    }
    const tricks: TrickSlot[] = [];
    for (let j = 0; j < nT; j++) {
      const o = b + 35 + j * 3;
      unopenedTricks[s]!.push(w[o] === UNOPENED_TRICK);
      tricks.push({ id: w[o]!, used: w[o + 1] !== 0, revealed: w[o + 2] !== 0 });
    }
    return { fighters, active: w[b + 1]!, grit: w[b + 2]!, tricks, braceStreak: w[b + 3]!, kos: w[b + 4]!, dealt: w[b + 5]!, last: w[b + 6]! };
  }) as [SideState, SideState];
  const winner = w[4]!;
  const state: BoutState = {
    format,
    turn: w[1]!,
    sides,
    phase,
    sudden: w[3] !== 0,
    result: phase === "over" ? { winner: winner as 0 | 1 | 2, reason: REASONS[w[5]!] ?? "forfeit" } : null,
  };
  return { state, paused, unopened, unopenedTricks };
}

export function decodeEvents(w: number[]): GameEvent[] {
  if (w.length % EVENT_LEN !== 0) throw new Error("decodeEvents: length not a multiple of 6");
  const out: GameEvent[] = [];
  for (let i = 0; i < w.length; i += EVENT_LEN) {
    const [t, side, a, b, c, d] = w.slice(i, i + EVENT_LEN) as [number, number, number, number, number, number];
    const s = side as Side;
    switch (t) {
      case 0:
        out.push({ t: "switch", side: s, from: a, to: b, cost: c, ...(d ? { refunded: true } : {}) });
        break;
      case 1:
        out.push({ t: "trick", side: s, trick: a, ...(b >= 0 ? { target: b as Side } : {}), ...(c >= 0 ? { amount: c } : {}) });
        break;
      case 2:
        out.push({
          t: "attack", side: s, attack: a, dmg: b, target: c, adv: ((d & 3) - 1) as -1 | 0 | 1,
          braced: !!(d & (1 << 2)), smoked: !!(d & (1 << 3)), countered: !!(d & (1 << 4)), nullified: !!(d & (1 << 5)),
          blocked: !!(d & (1 << 6)), guardBroken: !!(d & (1 << 7)), interrupted: !!(d & (1 << 8)),
        });
        break;
      case 3:
        out.push({ t: "brace", side: s, gained: a });
        break;
      case 4:
        out.push({ t: "ko", side: s, fighter: a, by: b as Side });
        break;
      case 5:
        out.push({ t: "replace", side: s, to: a });
        break;
      case 6:
        out.push({ t: "sudden" });
        break;
      case 7:
        out.push({ t: "end", result: { winner: side as 0 | 1 | 2, reason: REASONS[a] ?? "forfeit" } });
        break;
      default:
        throw new Error(`decodeEvents: unknown event type ${t}`);
    }
  }
  return out;
}
