/**
 * SUBLEVEL rules engine — types.
 *
 * DESIGN RULES (so the Solidity port is mechanical):
 *  - integers only (no floats), small ranges (fit uint8/uint16)
 *  - the engine is PURE: no Math.random, no Date. Randomness/seeds live outside.
 *  - state is plain JSON-serialisable data
 *  - the rulebook is DATA keyed by the same ids a card stores on-chain
 */

/** 0 BRAWL, 1 CLINCH, 2 SLICK.  BRAWL > CLINCH > SLICK > BRAWL */
export type Style = 0 | 1 | 2;

/** Attack rider tags. */
export const TAG = { PLAIN: 0, GRAPPLE: 1, COUNTER: 2, PIERCE: 3 } as const;
export type Tag = (typeof TAG)[keyof typeof TAG];

export interface AttackTemplate {
  id: number;
  style: Style;
  name: string;
  cost: number;
  dmg: number;
  tag: Tag;
}

export interface SpreadTemplate {
  id: number;
  name: string;
  hp: number;
  retreat: number;
}

export interface TrickTemplate {
  id: number;
  name: string;
  text: string;
}

/** Experimental rule switches (default all off). Pinned per format so tests/vectors are reproducible. */
export interface RuleFlags {
  /** E1: Brace only gains Grit if the opponent did not attack this turn. */
  braceGainIfUnattacked: boolean;
  /** E2: a Switch refunds its retreat cost if the opponent did not attack this turn. */
  switchRefundIfUnattacked: boolean;
  /** E3: guard triangle — Brace fully blocks LIGHT attacks (cost ≤ 2); HEAVY attacks (cost ≥ 3) break Brace for ⅔ damage;
   *  when both attack, a LIGHT attack interrupts a HEAVY one (the heavy deals half). */
  guardTriangle: boolean;
}
export const NO_FLAGS: RuleFlags = { braceGainIfUnattacked: false, switchRefundIfUnattacked: false, guardTriangle: false };

export interface FormatRules {
  id: 0 | 1;
  name: string;
  /** fighters per loadout */
  fighters: number;
  /** tricks per loadout */
  tricks: number;
  koTarget: number;
  turnCap: number;
  startGrit: number;
  /** hp scale, percent (integer) */
  hpPct: number;
  /** Full hides the bench/tricks until used; Lite is public. */
  hidden: boolean;
  rules: RuleFlags;
}

/** What a card stores on-chain (ids only; numbers come from the Rulebook). */
export interface FighterBuild {
  style: Style;
  attackIds: [number, number];
  spread: number;
}

export interface Loadout {
  fighters: FighterBuild[];
  tricks: number[];
  /** index into fighters */
  lead: number;
}

export interface FighterState {
  build: FighterBuild;
  maxHp: number;
  hp: number;
  retreat: number;
  /** has this fighter ever been in play (revealed)? */
  revealed: boolean;
  alive: boolean;
}

export interface TrickSlot {
  id: number;
  used: boolean;
  revealed: boolean;
}

export interface SideState {
  fighters: FighterState[];
  active: number;
  grit: number;
  tricks: TrickSlot[];
  /** consecutive Brace count (diminishing Brace) */
  braceStreak: number;
  /** KOs this side has scored */
  kos: number;
  /** damage this side has dealt */
  dealt: number;
  /** last action taken (for readers); -1 none */
  last: number;
}

export type Phase = "turn" | "replace" | "over";

export interface BoutResult {
  /** 0 or 1 = winner side, 2 = draw */
  winner: 0 | 1 | 2;
  reason: "ko" | "decision" | "draw" | "forfeit";
}

export interface BoutState {
  format: FormatRules;
  turn: number;
  sides: [SideState, SideState];
  phase: Phase;
  /** sudden death: first KO wins, replacements enter at 50% hp */
  sudden: boolean;
  result: BoutResult | null;
}

/**
 * Action encoding (uint8-friendly):
 *  0 ATTACK_1, 1 ATTACK_2, 2 BRACE, 3..5 SWITCH(slot 0..2), 6..7 TRICK(idx 0..1)
 */
export type Action = number;
export const A = {
  ATTACK1: 0,
  ATTACK2: 1,
  BRACE: 2,
  SWITCH0: 3,
  SWITCH1: 4,
  SWITCH2: 5,
  TRICK0: 6,
  TRICK1: 7,
} as const;

export type Side = 0 | 1;

export type GameEvent =
  | { t: "switch"; side: Side; from: number; to: number; cost: number; refunded?: boolean }
  | { t: "trick"; side: Side; trick: number; target?: Side; amount?: number }
  | { t: "attack"; side: Side; attack: number; dmg: number; adv: -1 | 0 | 1; braced: boolean; smoked: boolean; countered: boolean; nullified: boolean; blocked: boolean; guardBroken: boolean; interrupted: boolean; target: number }
  | { t: "brace"; side: Side; gained: number }
  | { t: "heal"; side: Side; amount: number }
  | { t: "grit"; side: Side; delta: number }
  | { t: "ko"; side: Side; fighter: number; by: Side }
  | { t: "replace"; side: Side; to: number }
  | { t: "sudden" }
  | { t: "end"; result: BoutResult };

export interface TurnOutcome {
  state: BoutState;
  events: GameEvent[];
}
