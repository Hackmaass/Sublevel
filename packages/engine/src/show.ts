/** Print the payoff matrix + equilibrium for a few typical states:  pnpm --filter @sublevel/engine tsx src/show.ts */
import { A, ATTACKS, LITE, FULL, PRESETS, createBout, resolveTurn } from "./index";
import { kindOf, solveGame, stateGame } from "./solver";
import type { BoutState } from "./types";

const name = (st: BoutState, side: 0 | 1, a: number) => {
  const s = st.sides[side];
  const f = s.fighters[s.active]!;
  if (a === A.ATTACK1 || a === A.ATTACK2) return ATTACKS[f.build.attackIds[a === A.ATTACK1 ? 0 : 1]!]!.name;
  if (a === A.BRACE) return "Brace";
  if (a >= A.SWITCH0 && a <= A.SWITCH2) return `Switch${a - A.SWITCH0}`;
  return `Trick${a - A.TRICK0}`;
};

function show(title: string, st: BoutState) {
  const g = stateGame(st, 0, 2);
  const sol = solveGame(g.M, 1500);
  console.log(`\n--- ${title}  (me grit ${st.sides[0].grit}, opp grit ${st.sides[1].grit}; hp ${st.sides[0].fighters[st.sides[0].active]!.hp} v ${st.sides[1].fighters[st.sides[1].active]!.hp}) value=${sol.value.toFixed(1)}`);
  const cols = g.theirs.map((a) => name(st, 1, a));
  console.log("".padEnd(11) + cols.map((c) => c.padStart(9)).join("") + "   | eq mix");
  g.mine.forEach((a, i) => {
    console.log(name(st, 0, a).padEnd(11) + g.M[i]!.map((v) => v.toFixed(0).padStart(9)).join("") + `   | ${(sol.x[i]! * 100).toFixed(0)}%  ${kindOf(st, 0, a)}`);
  });
  console.log("opp mix: " + g.theirs.map((a, j) => `${cols[j]} ${(sol.y[j]! * 100).toFixed(0)}%`).join("  "));
}

const P = (n: string) => PRESETS.find((p) => p.name === n)!.build;
let st = createBout(LITE, { fighters: [P("Rust Dog"), P("Gina Glass")], tricks: [0], lead: 0 }, { fighters: [P("Sister Nails"), P("The Accountant")], tricks: [1], lead: 0 });
show("Lite opening: Rust Dog (BRAWL) v Sister Nails (CLINCH)", st);
st = resolveTurn(st, A.ATTACK1, A.ATTACK1).state;
show("after a Jab trade", st);
const low = createBout({ ...LITE, startGrit: 1 }, { fighters: [P("Rust Dog"), P("Gina Glass")], tricks: [0], lead: 0 }, { fighters: [P("Sister Nails"), P("The Accountant")], tricks: [1], lead: 0 });
show("LOW GRIT (1 v 1)", low);
void FULL;
