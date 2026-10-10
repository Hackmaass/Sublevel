import { A, TRICKS, type Action, type GameEvent, type Side } from "@sublevel/engine";
import { actionInfo } from "./describe";
import type { TurnRecord } from "./game";

/**
 * The post-bout "tape": what each side did every turn, who out-read whom, and one thing to change.
 * Pure functions over the recorded history — nothing here touches the rules.
 */
export interface TapeRow {
  turn: number;
  me: string;
  opp: string;
  verdict: "read" | "outread" | "even";
  why: string;
  dealt: number;
  taken: number;
}

const attacks = (ev: GameEvent[], side: Side) => ev.flatMap((e) => (e.t === "attack" && e.side === side ? [e] : []));

function damageBy(ev: GameEvent[], side: Side): number {
  let d = 0;
  for (const e of ev) {
    if (e.t === "attack" && e.side === side) d += e.dmg;
    else if (e.t === "trick" && e.side === side && e.target !== undefined && e.target !== side) d += e.amount ?? 0;
  }
  return d;
}

function moveName(rec: TurnRecord, side: Side): string {
  const a = rec.actions[side];
  const info = actionInfo(rec.before, side, a);
  if (info.kind === "attack") return `${info.title} (${info.cls})`;
  return info.title;
}

function explain(rec: TurnRecord): { verdict: TapeRow["verdict"]; why: string } {
  const ev = rec.events;
  const [mine, theirs] = [attacks(ev, 0)[0], attacks(ev, 1)[0]];
  const dealt = damageBy(ev, 0);
  const taken = damageBy(ev, 1);
  if (mine?.blocked) return { verdict: "outread", why: "They Braced — your LIGHT attack was blocked." };
  if (theirs?.blocked) return { verdict: "read", why: "You Braced — their LIGHT attack was blocked." };
  if (mine?.guardBroken) return { verdict: "read", why: "Your HEAVY attack broke their guard." };
  if (theirs?.guardBroken) return { verdict: "outread", why: "Their HEAVY attack broke your guard." };
  if (theirs?.interrupted) return { verdict: "read", why: "Your LIGHT attack interrupted their HEAVY — it landed for half." };
  if (mine?.interrupted) return { verdict: "outread", why: "Their LIGHT attack interrupted your HEAVY — it landed for half." };
  if (mine?.countered) return { verdict: "read", why: "You punished their Switch with a COUNTER." };
  if (theirs?.countered) return { verdict: "outread", why: "Their COUNTER punished your Switch." };
  const sw = ev.find((e) => e.t === "switch");
  if (sw && sw.t === "switch" && dealt === 0 && taken === 0) return { verdict: "even", why: `${sw.side === 0 ? "You" : "They"} switched ${sw.refunded ? "for free" : "out"}.` };
  const trick = ev.find((e) => e.t === "trick");
  if (trick && trick.t === "trick" && dealt !== taken) return { verdict: trick.side === 0 ? "read" : "outread", why: `${trick.side === 0 ? "Your" : "Their"} ${TRICKS[trick.trick]?.name ?? "Dirty Trick"} landed.` };
  if (dealt > 0 && taken > 0) return { verdict: dealt > taken ? "read" : dealt < taken ? "outread" : "even", why: `Traded blows — ${dealt} dealt, ${taken} taken.` };
  if (dealt > 0) return { verdict: "read", why: `Clean hit for ${dealt}.` };
  if (taken > 0) return { verdict: "outread", why: `You took ${taken} and gave nothing back.` };
  return { verdict: "even", why: "Nothing landed." };
}

export function tape(history: TurnRecord[]): TapeRow[] {
  return history.map((rec) => {
    const { verdict, why } = explain(rec);
    return { turn: rec.turn, me: moveName(rec, 0), opp: moveName(rec, 1), verdict, why, dealt: damageBy(rec.events, 0), taken: damageBy(rec.events, 1) };
  });
}

const kind = (a: Action): "attack" | "brace" | "switch" | "trick" => (a === A.ATTACK1 || a === A.ATTACK2 ? "attack" : a === A.BRACE ? "brace" : a >= A.SWITCH0 && a <= A.SWITCH2 ? "switch" : "trick");

/** One concrete thing to change next bout (or a compliment when there isn't one). */
export function takeaway(history: TurnRecord[], won: boolean): string {
  const n = history.length;
  if (n === 0) return "";
  const mine = history.map((h) => h.actions[0]);
  const count = (f: (a: Action) => boolean) => mine.filter(f).length;
  const braces = count((a) => a === A.BRACE);
  const heavies = count((a) => a === A.ATTACK2);
  const lights = count((a) => a === A.ATTACK1);
  const blockedByThem = history.filter((h) => attacks(h.events, 0).some((e) => e.blocked)).length;
  const brokeByThem = history.filter((h) => attacks(h.events, 1).some((e) => e.guardBroken)).length;
  const wasted = history.filter((h) => h.actions[0] === A.BRACE && damageBy(h.events, 1) === 0 && !attacks(h.events, 1).length).length;
  // the same non-trivial move over and over is a habit a reader can punish
  for (const [name, c, a] of [["Brace", braces, A.BRACE], ["your HEAVY", heavies, A.ATTACK2], ["your LIGHT", lights, A.ATTACK1]] as const) {
    if (n >= 4 && c / n >= 0.6) return `You played ${name} in ${c} of ${n} turns. A reader just waits for it — mix in something else (${kind(a) === "brace" ? "they'll hit you with HEAVY" : "they'll Brace"}).`;
  }
  if (brokeByThem >= 2) return `Their HEAVY broke your Brace ${brokeByThem} times. Bracing every time they have 3+ Grit is a tell — a LIGHT attack interrupts a HEAVY.`;
  if (blockedByThem >= 2) return `They Braced against you ${blockedByThem} times. When they're saving Grit and turtling, a HEAVY (or a GRAPPLE) gets through.`;
  if (wasted >= 2) return `You Braced ${wasted} times with nothing coming. Brace is for when you expect a LIGHT attack — otherwise you're just waiting.`;
  return won ? "Clean fight. Next time, try to win a turn by reading their Grit: low Grit means they can't go HEAVY." : "Close one. Watch their Grit — at 3+ they can go HEAVY, at 0–1 they can only Brace or poke.";
}
