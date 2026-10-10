/**
 * Coach copy for the scripted first fight. The moves and outcomes are pinned by the engine (`packages/engine/src/tutorial.ts`
 * + its test); this file only holds the words. `before` shows while the player chooses, `after` once the turn has landed.
 */
export interface Lesson {
  title: string;
  before: string;
  after: string;
  /** one-line rule to leave on the wall once the lesson lands */
  rule: string;
}

export const LESSONS: Lesson[] = [
  {
    title: "THE BASICS",
    before:
      "Every turn you and your opponent each lock ONE move in secret — then both flip at once. You're Rust Dog (BRAWL). Across the ring: The Auditor (SLICK). Throw the cheap LIGHT attack: Jab. Pick it, then LOCK IN.",
    after:
      "You both hit — but look: yours was WEAK, theirs was STRONG. SLICK beats BRAWL. Moves cost Grit (the matchsticks), and everyone earns +1 Grit every turn.",
    rule: "BRAWL > CLINCH > SLICK > BRAWL",
  },
  {
    title: "BRACE",
    before: "Same guy, same move coming — a LIGHT attack. Don't trade. Brace.",
    after: "BLOCKED. A Brace stops a LIGHT attack cold, and pays you +1 Grit. You're stacking matches while they burn theirs.",
    rule: "BRACE beats LIGHT",
  },
  {
    title: "BREAK THE GUARD",
    before: "Now he's turtling up. A HEAVY attack (cost 3+) breaks a Brace — and you've got the Grit for Haymaker. Swing it.",
    after: "GUARD BROKEN — still two-thirds damage through. But HEAVY burned almost all your Grit. That's the price.",
    rule: "HEAVY beats BRACE",
  },
  {
    title: "TAG OUT",
    before: "Rust Dog is hurting and SLICK beats BRAWL. Switch to Sister Nails — CLINCH beats SLICK. Switches land before attacks.",
    after: "FREE SWITCH. They didn't attack, so your retreat cost came back. Had they swung, Nails would have eaten it — that's the gamble.",
    rule: "SWITCH: free if they don't attack",
  },
  {
    title: "READ THEM",
    before: "He's got 5 Grit saved up — smells like a HEAVY. A LIGHT attack interrupts a HEAVY one. Hit him with Hold.",
    after: "INTERRUPTED. His Flurry landed for half and your Hold hit STRONG. Light beats Heavy, Heavy beats Brace, Brace beats Light — guess right, or pay.",
    rule: "LIGHT beats HEAVY",
  },
  {
    title: "DIRTY TRICK",
    before: "He's one scratch from done. Time for your one-shot Dirty Trick: Cheap Shot. 2 damage, ignores Brace and matchups. Play it.",
    after: "",
    rule: "TRICKS: one use, no guard, no matchup",
  },
];

export const TUTORIAL_KEY = "sublevel.tutorial.done";

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* storage may be unavailable */
  }
}
