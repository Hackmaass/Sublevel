/**
 * Generates the numeric tables in docs/HOW_TO_PLAY.md from the rulebook, so the manual can never drift from the game.
 *   pnpm --filter @sublevel/engine manual
 * The in-game "How to play" overlay reads the same rulebook directly.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTACKS, FULL, GRIT_CAP, LITE, SPREADS, STYLE_NAMES, TRICKS, TRICK_COST, isHeavy } from "./rulebook";
import { PRESETS } from "./builds";
import { TAG } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const doc = resolve(here, "../../../docs/HOW_TO_PLAY.md");

const tagText = (t: number) => (t === TAG.GRAPPLE ? "GRAPPLE — ignores Brace" : t === TAG.COUNTER ? "COUNTER — +2 if they switch" : t === TAG.PIERCE ? "PIERCE — ignores bad matchups" : "—");

const attacks = ["| Style | Attack | Class | Grit | Damage | Rider |", "|---|---|---|---|---|---|"]
  .concat(ATTACKS.map((a) => `| ${STYLE_NAMES[a.style]} | **${a.name}** | ${isHeavy(a.cost) ? "HEAVY" : "LIGHT"} | ${a.cost} | ${a.dmg} | ${tagText(a.tag)} |`))
  .join("\n");

const spreads = ["| Spread | HP (full scale) | Retreat (Grit to switch out) |", "|---|---|---|"]
  .concat(SPREADS.map((s) => `| ${s.name} | ${s.hp} | ${s.retreat} |`))
  .join("\n");

const tricks = [`| Trick | Effect (cost ${TRICK_COST} Grit, once per bout) |`, "|---|---|"].concat(TRICKS.map((t) => `| **${t.name}** | ${t.text} |`)).join("\n");

const fmtRow = (label: string, f: (x: typeof LITE) => string) => `| ${label} | ${f(LITE)} | ${f(FULL)} |`;
const formats = [
  "| | Lite | Full |",
  "|---|---|---|",
  fmtRow("Fighters / Tricks", (x) => `${x.fighters} / ${x.tricks}`),
  fmtRow("KOs to win", (x) => String(x.koTarget)),
  fmtRow("Turn cap", (x) => `${x.turnCap} turns`),
  fmtRow("Starting Grit", (x) => `${x.startGrit} (max ${GRIT_CAP})`),
  fmtRow("HP scale", (x) => `${x.hpPct}%`),
  fmtRow("Opponent sees your corner?", (x) => (x.hidden ? "no (hidden until used)" : "yes (only the lead is secret)")),
].join("\n");

const presets = ["| Fighter | Style | Attacks | Spread | |", "|---|---|---|---|---|"]
  .concat(PRESETS.map((p) => `| **${p.name}** | ${STYLE_NAMES[p.build.style]} | ${ATTACKS[p.build.attackIds[0]]!.name} + ${ATTACKS[p.build.attackIds[1]]!.name} | ${SPREADS[p.build.spread]!.name} | *${p.tagline}* |`))
  .join("\n");

let md = readFileSync(doc, "utf-8");
const fill = (key: string, body: string) => {
  const re = new RegExp(`(<!-- GEN:${key} -->)[\\s\\S]*?(<!-- /GEN:${key} -->)`);
  if (!re.test(md)) throw new Error(`marker ${key} missing in HOW_TO_PLAY.md`);
  md = md.replace(re, `$1\n${body}\n$2`);
};
fill("attacks", attacks);
fill("spreads", spreads);
fill("tricks", tricks);
fill("formats", formats);
fill("presets", presets);
writeFileSync(doc, md);
console.log("HOW_TO_PLAY.md tables regenerated from the rulebook.");
