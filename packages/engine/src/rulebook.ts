import type { AttackTemplate, FormatRules, RuleFlags, SpreadTemplate, Style, TrickTemplate } from "./types";
import { NO_FLAGS, TAG } from "./types";

/**
 * RULEBOOK v0 — PLACEHOLDER NUMBERS. The simulator (src/sim.ts) tunes these.
 * Season-pinned in production: cards store ids; numbers live here.
 */
export const RULEBOOK_VERSION = "v1";

/** Rulebook v1 rule set (chosen by the depth gate: E2 free-unpunished-Switch + E3 guard triangle). */
export const V1_RULES: RuleFlags = { braceGainIfUnattacked: false, switchRefundIfUnattacked: true, guardTriangle: true };

export const GRIT_CAP = 5;
export const TRICK_COST = 1;

export const STYLE_NAMES = ["BRAWL", "CLINCH", "SLICK"] as const;

/** +1 if `att` beats `def`, -1 if `def` beats `att`, else 0. BRAWL>CLINCH>SLICK>BRAWL */
export function advantage(att: Style, def: Style): -1 | 0 | 1 {
  if (att === def) return 0;
  return (att + 1) % 3 === def ? 1 : -1;
}

const P = TAG.PLAIN, G = TAG.GRAPPLE, C = TAG.COUNTER, X = TAG.PIERCE;

// 6 attacks per style; id = style*6 + n
const raw: Array<[Style, string, number, number, number]> = [
  // BRAWL — expensive, hard-hitting; two PIERCE attacks shrug off bad matchups
  [0, "Jab", 1, 2, P],
  [0, "Hook", 2, 4, P],
  [0, "Overhand", 3, 6, P],
  [0, "Haymaker", 4, 8, P],
  [0, "Body Blow", 2, 3, X],
  [0, "Rampage", 3, 5, X],
  // CLINCH — GRAPPLE ignores Brace
  [1, "Shove", 1, 1, G],
  [1, "Hold", 2, 3, G],
  [1, "Headbutt", 2, 4, X],
  [1, "Takedown", 3, 5, G],
  [1, "Slam", 4, 7, G],
  [1, "Knee", 1, 2, P],
  // SLICK — cheap and quick; COUNTER punishes a Switch
  [2, "Paper Cut", 1, 2, P],
  [2, "One-Two", 2, 4, P],
  [2, "Counter", 2, 3, C],
  [2, "Riposte", 3, 5, C],
  [2, "Flurry", 3, 5, P],
  [2, "Finisher", 4, 7, P],
];

export const ATTACKS: AttackTemplate[] = raw.map(([style, name, cost, dmg, tag], i) => ({
  id: i,
  style,
  name,
  cost,
  dmg,
  tag: tag as AttackTemplate["tag"],
}));

export function attacksOfStyle(style: Style): AttackTemplate[] {
  return ATTACKS.filter((a) => a.style === style);
}

export const SPREADS: SpreadTemplate[] = [
  { id: 0, name: "Bulky", hp: 11, retreat: 2 },
  { id: 1, name: "Steady", hp: 8, retreat: 1 },
  { id: 2, name: "Nimble", hp: 6, retreat: 0 },
];

export const TRICKS: TrickTemplate[] = [
  { id: 0, name: "Cheap Shot", text: "Deal 2 damage to their active fighter. Ignores Brace and weakness." },
  { id: 1, name: "Patch Up", text: "Heal your active fighter for 3." },
  { id: 2, name: "Second Wind", text: "Gain 2 Grit." },
  { id: 3, name: "Smoke Bomb", text: "Their attack this turn deals half damage." },
  { id: 4, name: "Sucker Punch", text: "If they attack: take no damage from it and deal 3 to them." },
  { id: 5, name: "Low Blow", text: "They lose 2 Grit." },
];

export const LITE: FormatRules = {
  id: 0,
  name: "Lite — First Blood",
  fighters: 2,
  tricks: 1,
  koTarget: 1,
  turnCap: 8,
  startGrit: 2,
  hpPct: 100,
  hidden: false,
  rules: V1_RULES,
};

export const FULL: FormatRules = {
  id: 1,
  name: "Full — Main Card",
  fighters: 3,
  tricks: 2,
  koTarget: 2,
  turnCap: 10,
  startGrit: 3,
  hpPct: 75,
  hidden: true,
  rules: V1_RULES,
};

export const FORMATS = [LITE, FULL] as const;

/** A format with experimental rule flags applied (for the simulator / rule experiments). */
export const withRules = (f: FormatRules, flags: Partial<RuleFlags>): FormatRules => ({ ...f, rules: { ...f.rules, ...flags } });
/** light = cost ≤ 2, heavy = cost ≥ 3 */
export const isHeavy = (cost: number): boolean => cost >= 3;
