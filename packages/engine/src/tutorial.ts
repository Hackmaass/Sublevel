import { A, type Action, type Loadout } from "./types";
import { ATTACKS, LITE } from "./rulebook";
import type { Bot } from "./bots";

/**
 * The scripted first fight ("Learn to fight"): a six-turn Lite bout where the opponent plays fixed moves so every
 * lesson lands. It runs on the REAL engine — nothing here changes a rule; `test/tutorial.test.ts` replays it and asserts
 * the outcome of every turn, so a rulebook change that breaks a lesson fails loudly.
 *
 *  T1 attack      you are BRAWL, they are SLICK (SLICK beats BRAWL): your hit is weak, theirs is strong
 *  T2 brace       a Brace blocks a LIGHT attack completely (+1 Grit)
 *  T3 heavy       a HEAVY attack breaks a Brace (⅔ damage) — and costs a lot of Grit
 *  T4 switch      tag the hurt fighter out for a better matchup; unpunished (they Brace) = free
 *  T5 interrupt   when both attack, a LIGHT attack interrupts a HEAVY one — and CLINCH beats SLICK
 *  T6 trick       a Dirty Trick (Cheap Shot) finishes the job
 */
const atk = (name: string): number => {
  const t = ATTACKS.find((a) => a.name === name);
  if (!t) throw new Error(`unknown attack ${name}`);
  return t.id;
};

export const TUTORIAL_FORMAT = LITE;

export const TUTORIAL_LOADOUTS: [Loadout, Loadout] = [
  {
    fighters: [
      { style: 0, attackIds: [atk("Jab"), atk("Haymaker")], spread: 1 }, // Rust Dog
      { style: 1, attackIds: [atk("Hold"), atk("Slam")], spread: 0 }, // Sister Nails
    ],
    tricks: [0], // Cheap Shot
    lead: 0,
  },
  {
    fighters: [
      { style: 2, attackIds: [atk("Paper Cut"), atk("Flurry")], spread: 0 }, // The Auditor (a sturdy SLICK)
      { style: 0, attackIds: [atk("Hook"), atk("Overhand")], spread: 0 }, // Big Tony (never plays)
    ],
    tricks: [3], // Smoke Bomb (never played)
    lead: 0,
  },
];

/** names and portrait seeds (seed = preset index + 1, so the art matches the roster) */
export const TUTORIAL_NAMES: [string[], string[]] = [["Rust Dog", "Sister Nails"], ["The Auditor", "Big Tony"]];
export const TUTORIAL_SEEDS: [number[], number[]] = [[1, 4], [7, 2]];

export interface TutorialStep {
  /** the only move the lesson allows */
  me: Action;
  /** what the scripted opponent plays */
  opp: Action;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { me: A.ATTACK1, opp: A.ATTACK1 }, // Jab vs Paper Cut
  { me: A.BRACE, opp: A.ATTACK1 }, // Brace eats the Paper Cut
  { me: A.ATTACK2, opp: A.BRACE }, // Haymaker breaks their Brace
  { me: A.SWITCH1, opp: A.BRACE }, // swap to Sister Nails for free
  { me: A.ATTACK1, opp: A.ATTACK2 }, // Hold interrupts their Flurry
  { me: A.TRICK0, opp: A.ATTACK1 }, // Cheap Shot — KO
];

/** Opponent policy for the scripted bout (indexed by turn; falls back to Brace if the bout somehow runs long). */
export const tutorialBot: Bot = (state, _side) => TUTORIAL_STEPS[state.turn]?.opp ?? A.BRACE;
