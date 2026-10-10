import { A, ATTACKS, SPREADS, STYLE_NAMES, TAG, TRICKS, isHeavy, type Action, type BoutState, type FighterState, type Side } from "@sublevel/engine";

export const STYLE_COLOR = ["#ff5a1f", "#f5f1e6", "#7a5cff"] as const; // BRAWL tape-orange, CLINCH chalk, SLICK bruise
export const STYLE_INK = ["#0b0b0c", "#f5f1e6", "#f5f1e6"] as const;
/** stamp backgrounds (CLINCH is a black stamp with chalk text so it reads on paper) */
export const STYLE_STAMP_BG = ["#ff5a1f", "#0b0b0c", "#7a5cff"] as const;
export const STYLE_GLYPH = ["✊", "🤼", "⚡"] as const;
export const TAG_TEXT: Record<number, string> = {
  [TAG.PLAIN]: "",
  [TAG.GRAPPLE]: "GRAPPLE · ignores Brace",
  [TAG.COUNTER]: "COUNTER · +2 if they switch",
  [TAG.PIERCE]: "PIERCE · ignores bad matchups",
};

export interface ActionInfo {
  action: Action;
  kind: "attack" | "brace" | "switch" | "trick";
  title: string;
  sub: string;
  cost: number;
  dmg?: number;
  /** LIGHT (cost ≤ 2) or HEAVY (cost ≥ 3) — decision-critical under the guard triangle */
  cls?: "LIGHT" | "HEAVY";
  key: string;
  slot?: number;
}

export function actionInfo(state: BoutState, side: Side, action: Action): ActionInfo {
  const s = state.sides[side];
  const f = s.fighters[s.active]!;
  if (action === A.ATTACK1 || action === A.ATTACK2) {
    const idx = action === A.ATTACK1 ? 0 : 1;
    const t = ATTACKS[f.build.attackIds[idx]!]!;
    return { action, kind: "attack", title: t.name, sub: TAG_TEXT[t.tag] ?? "", cost: t.cost, dmg: t.dmg, cls: isHeavy(t.cost) ? "HEAVY" : "LIGHT", key: String(idx + 1) };
  }
  if (action === A.BRACE) return { action, kind: "brace", title: "Brace", sub: "Blocks LIGHT attacks · HEAVY breaks it (⅔) · +1 Grit (once in a row)", cost: 0, key: "3" };
  if (action >= A.SWITCH0 && action <= A.SWITCH2) {
    const slot = action - A.SWITCH0;
    const target = s.fighters[slot]!;
    return { action, kind: "switch", title: "Switch", sub: target.revealed || !state.format.hidden || side === 0 ? `→ slot ${slot + 1}` : "→ ???", cost: f.retreat, key: "", slot };
  }
  const idx = action - A.TRICK0;
  const slot = s.tricks[idx]!;
  const t = TRICKS[slot.id];
  return { action, kind: "trick", title: t?.name ?? "Dirty Trick", sub: t?.text ?? "", cost: 1, key: idx === 0 ? "T" : "Y" };
}

export const styleName = (f: FighterState) => (f.build.attackIds[0] >= 0 ? STYLE_NAMES[f.build.style] : "???");
export const spreadName = (f: FighterState) => SPREADS[f.build.spread]?.name ?? "???";

/** deterministic jagged "torn paper" polygon for clip-path */
export function tornClip(seed: number, amp = 1.4): string {
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => {
    a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (a >>> 8) / 16777216;
  };
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(1)}% ${(rnd() * amp).toFixed(2)}%`);
  for (let i = 1; i <= n; i++) pts.push(`${(100 - rnd() * amp).toFixed(2)}% ${((i / n) * 100).toFixed(1)}%`);
  for (let i = n - 1; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% ${(100 - rnd() * amp).toFixed(2)}%`);
  for (let i = n - 1; i >= 1; i--) pts.push(`${(rnd() * amp).toFixed(2)}% ${((i / n) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(",")})`;
}
