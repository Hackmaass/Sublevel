import { ATTACKS, SPREADS, TRICKS, isHeavy } from "./rulebook";
import type { Rng } from "./rng";
import type { FighterBuild, FormatRules, Loadout, Style } from "./types";

/**
 * Build-menu rule (from the depth gate): a fighter carries exactly ONE light attack (cost ≤ 2) and ONE heavy attack (cost ≥ 3),
 * both of its style. It keeps the guard triangle live (light vs heavy) and removes the "two mid-cost attacks" trap builds.
 * BRAWL 3×3 + CLINCH 4×2 + SLICK 3×3 = 26 attack pairs × 3 spreads = 78 legal builds. (The Cards contract enforces the same rule at mint.)
 */
export function isLegalBuild(b: FighterBuild): boolean {
  const [x, y] = b.attackIds.map((id) => ATTACKS[id]);
  if (!x || !y || x.style !== b.style || y.style !== b.style || x.id === y.id) return false;
  if (!SPREADS[b.spread]) return false;
  return isHeavy(x.cost) !== isHeavy(y.cost);
}

/** All legal builds: 78. */
export function allBuilds(): FighterBuild[] {
  const out: FighterBuild[] = [];
  for (const style of [0, 1, 2] as Style[]) {
    const atk = ATTACKS.filter((a) => a.style === style);
    const light = atk.filter((a) => !isHeavy(a.cost));
    const heavy = atk.filter((a) => isHeavy(a.cost));
    for (const l of light) for (const h of heavy) for (const sp of SPREADS) out.push({ style, attackIds: [l.id, h.id], spread: sp.id });
  }
  return out;
}

export const buildKey = (b: FighterBuild): string => `${b.style}:${b.attackIds[0]}-${b.attackIds[1]}:${b.spread}`;

/** Twelve curated presets = shortcuts into the module menu (and the free starter pool). */
export interface Preset {
  name: string;
  tagline: string;
  build: FighterBuild;
}

const at = (name: string): number => {
  const t = ATTACKS.find((a) => a.name === name);
  if (!t) throw new Error(`unknown attack ${name}`);
  return t.id;
};

export const PRESETS: Preset[] = [
  { name: "Rust Dog", tagline: "Hits like a truck, thinks like a dog.", build: { style: 0, attackIds: [at("Jab"), at("Haymaker")], spread: 1 } },
  { name: "Big Tony", tagline: "Slow. Heavy. Patient.", build: { style: 0, attackIds: [at("Hook"), at("Overhand")], spread: 0 } },
  { name: "Gutter Saint", tagline: "Doesn't care about your advantage.", build: { style: 0, attackIds: [at("Body Blow"), at("Rampage")], spread: 1 } },
  { name: "Sister Nails", tagline: "Once she has you, she has you.", build: { style: 1, attackIds: [at("Hold"), at("Slam")], spread: 0 } },
  { name: "Ivan the Vice", tagline: "Quiet. Always close.", build: { style: 1, attackIds: [at("Shove"), at("Takedown")], spread: 1 } },
  { name: "Knuckles Malone", tagline: "Elbows, knees, bad intentions.", build: { style: 1, attackIds: [at("Headbutt"), at("Takedown")], spread: 2 } },
  { name: "The Accountant", tagline: "Audits your guard. Every time.", build: { style: 2, attackIds: [at("Paper Cut"), at("Flurry")], spread: 1 } },
  { name: "Gina Glass", tagline: "Dances out. Cuts in.", build: { style: 2, attackIds: [at("Counter"), at("Flurry")], spread: 2 } },
  { name: "Old Reliable", tagline: "Lets you tire yourself out.", build: { style: 2, attackIds: [at("Counter"), at("Riposte")], spread: 0 } },
  { name: "Mercy Kane", tagline: "A finisher with a conscience. Almost.", build: { style: 2, attackIds: [at("Paper Cut"), at("Finisher")], spread: 1 } },
  { name: "Dutch Pete", tagline: "Takes it. Gives it back.", build: { style: 0, attackIds: [at("Jab"), at("Overhand")], spread: 0 } },
  { name: "Small Hours", tagline: "Light on his feet, heavy on grudges.", build: { style: 1, attackIds: [at("Knee"), at("Slam")], spread: 2 } },
];

export function randomBuild(rng: Rng): FighterBuild {
  const all = allBuilds();
  return all[Math.floor(rng() * all.length)]!;
}

/** Random loadout for a format (distinct fighter builds, distinct tricks). */
export function randomLoadout(rng: Rng, format: FormatRules): Loadout {
  const fighters: FighterBuild[] = [];
  const seen = new Set<string>();
  while (fighters.length < format.fighters) {
    const b = randomBuild(rng);
    const k = buildKey(b);
    if (!seen.has(k)) {
      seen.add(k);
      fighters.push(b);
    }
  }
  const trickIds = TRICKS.map((t) => t.id);
  const tricks: number[] = [];
  while (tricks.length < format.tricks) {
    const id = trickIds[Math.floor(rng() * trickIds.length)]!;
    if (!tricks.includes(id)) tricks.push(id);
  }
  return { fighters, tricks, lead: Math.floor(rng() * fighters.length) };
}

/** Loadout from presets (for UI starter pools). */
export function presetLoadout(format: FormatRules, presetIdx: number[], tricks: number[], lead = 0): Loadout {
  return { fighters: presetIdx.slice(0, format.fighters).map((i) => PRESETS[i]!.build), tricks: tricks.slice(0, format.tricks), lead };
}
