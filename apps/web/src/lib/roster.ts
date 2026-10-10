import { PRESETS, isLegalBuild, type FighterBuild } from "@sublevel/engine";

/** A fighter in the Locker: a house preset or one the player built on the Workbench. */
export interface RosterEntry {
  key: string; // "p:3" (preset) | "c:<id>" (custom)
  name: string;
  tagline: string;
  build: FighterBuild;
  /** drives the procedural portrait; presets use index+1 (kept stable), customs use a hash ≥ 1000 */
  seed: number;
  custom: boolean;
}

export const MAX_CUSTOM = 11; // the wall shows 12 slots: 11 customs + the "+ BUILD" tile
export const MAX_NAME = 32; // = Cards.MAX_NAME
/** Same alphabet the Cards contract accepts (so a fighter built here can be minted unchanged): 0-9 A-Z a-z space - ' . ! */
export const NAME_RE = /^[0-9A-Za-z \-'.!]{1,32}$/;

export const presetEntries: RosterEntry[] = PRESETS.map((p, i) => ({ key: `p:${i}`, name: p.name, tagline: p.tagline, build: p.build, seed: i + 1, custom: false }));

export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return "Give them a name.";
  if (n.length > MAX_NAME) return `Max ${MAX_NAME} characters.`;
  if (!NAME_RE.test(n)) return "Letters, numbers, space - ' . ! only.";
  return null;
}

/** small stable string hash → portrait seed (≥ 1000 so it never collides with a preset seed) */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return 1000 + ((h >>> 0) % 90000);
}

const KEY = "sublevel.customs.v1";

interface Stored {
  id: string;
  name: string;
  style: number;
  attackIds: [number, number];
  spread: number;
}

/** localStorage can be absent, blocked or hold junk: every read validates, every access is guarded */
export function loadCustoms(): RosterEntry[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Stored[];
    if (!Array.isArray(arr)) return [];
    const out: RosterEntry[] = [];
    for (const s of arr.slice(0, MAX_CUSTOM)) {
      const build = { style: s.style, attackIds: s.attackIds, spread: s.spread } as FighterBuild;
      if (typeof s.id !== "string" || typeof s.name !== "string" || nameProblem(s.name) || !isLegalBuild(build)) continue;
      out.push({ key: `c:${s.id}`, name: s.name.trim(), tagline: "Built in the Workbench.", build, seed: seedOf(s.id + s.name), custom: true });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustoms(list: RosterEntry[]): void {
  try {
    const data: Stored[] = list.map((e) => ({ id: e.key.slice(2), name: e.name, style: e.build.style, attackIds: e.build.attackIds, spread: e.build.spread }));
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: the fighter lives for this session only */
  }
}

export function newCustom(name: string, build: FighterBuild): RosterEntry {
  const id = Math.random().toString(36).slice(2, 9);
  const n = name.trim();
  return { key: `c:${id}`, name: n, tagline: "Built in the Workbench.", build, seed: seedOf(id + n), custom: true };
}
