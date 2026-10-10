import { ATTACKS, advantage, GRIT_CAP } from "./rulebook";
import type { BoutState, Side } from "./types";

export const FEATURE_NAMES = ["bias", "koDiff", "hpTotalDiff", "activeHpDiff", "gritDiff", "myGrit", "oppGrit", "advantage", "tricksDiff", "potential", "turnFrac", "sudden"] as const;

/** Public-state features from `me`'s perspective (used by the fitted value function). */
export function features(st: BoutState, me: Side): number[] {
  const a = st.sides[me];
  const b = st.sides[(1 - me) as Side];
  const frac = (s: typeof a) => {
    let hp = 0;
    let max = 0;
    for (const f of s.fighters) {
      hp += f.alive ? Math.max(0, f.hp) : 0;
      max += f.maxHp;
    }
    return hp / Math.max(1, max);
  };
  const fa = a.fighters[a.active]!;
  const fb = b.fighters[b.active]!;
  const act = (s: typeof a) => {
    const f = s.fighters[s.active]!;
    return f.alive ? Math.max(0, f.hp) / Math.max(1, f.maxHp) : 0;
  };
  // best affordable damage next turn (a cheap proxy for threat)
  const pot = (s: typeof a, foe: typeof fb) => {
    const f = s.fighters[s.active]!;
    let best = 0;
    for (const id of f.build.attackIds) {
      const t = ATTACKS[id]!;
      if (s.grit >= t.cost) {
        const rel = advantage(f.build.style, foe.build.style);
        best = Math.max(best, rel > 0 ? Math.ceil(t.dmg * 1.5) : rel < 0 ? Math.max(1, Math.floor((t.dmg * 2) / 3)) : t.dmg);
      }
    }
    return best / 8;
  };
  const rel = fa.build.attackIds[0] >= 0 && fb.build.attackIds[0] >= 0 ? advantage(fa.build.style, fb.build.style) : 0;
  return [
    1,
    a.kos - b.kos,
    frac(a) - frac(b),
    act(a) - act(b),
    (a.grit - b.grit) / GRIT_CAP,
    a.grit / GRIT_CAP,
    b.grit / GRIT_CAP,
    rel,
    (a.tricks.filter((t) => !t.used).length - b.tricks.filter((t) => !t.used).length) / 2,
    pot(a, fb) - pot(b, fa),
    st.turn / st.format.turnCap,
    st.sudden ? 1 : 0,
  ];
}
