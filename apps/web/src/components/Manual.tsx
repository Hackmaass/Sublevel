"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ATTACKS, FULL, GRIT_CAP, LITE, SPREADS, STYLE_NAMES, TAG, TRICKS, TRICK_COST, isHeavy } from "@sublevel/engine";
import { STYLE_COLOR, STYLE_STAMP_BG } from "@/lib/describe";
import { sfx } from "@/lib/sfx";
import { useGame } from "@/lib/game";
import { Matches, Stamp, Tape } from "./ui/Marks";

/** In-game "How to play". Every number comes straight from the engine rulebook, so it can't drift from the game. */

const TABS = ["THE GOAL", "YOUR TURN", "THE MOVES", "GUARD TRIANGLE", "STYLES & RIDERS", "GRIT", "WINNING", "FORMATS", "THE CARDS", "CONTROLS"] as const;
type Tab = (typeof TABS)[number];

export function Manual() {
  const open = useGame((s) => s.manualOpen);
  const close = useGame((s) => s.closeManual);
  const [tab, setTab] = useState<Tab>("THE GOAL");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setTab((t) => TABS[Math.min(TABS.length - 1, TABS.indexOf(t) + 1)]!);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setTab((t) => TABS[Math.max(0, TABS.indexOf(t) - 1)]!);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="manual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(4,4,5,0.88)", display: "grid", placeItems: "center" }} onClick={close}>
          <motion.div
            initial={{ y: 60, rotate: -2, opacity: 0 }}
            animate={{ y: 0, rotate: -0.4, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            className="paper"
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: 1500, height: 900, display: "flex", boxShadow: "0 40px 100px rgba(0,0,0,0.8)", clipPath: "polygon(0 0.6%, 2% 0, 98% 0.5%, 100% 2.5%, 99.6% 98.5%, 97% 100%, 2% 99.4%, 0 97%)" }}
          >
            <Tape w={150} h={34} rotate={-5} style={{ left: 120, top: -14 }} />
            <Tape w={150} h={34} rotate={6} style={{ right: 140, top: -14 }} />
            <div style={{ width: 330, padding: "34px 0 26px 30px", borderRight: "3px solid #0b0b0c", display: "flex", flexDirection: "column" }}>
              <div className="stencil" style={{ fontSize: 15, letterSpacing: "0.3em", color: "#555" }}>THE HOUSE RULES</div>
              <div className="display" style={{ fontSize: 56, lineHeight: 1, color: "#0b0b0c", marginBottom: 18 }}>HOW TO PLAY</div>
              {TABS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    sfx.tick();
                  }}
                  className="display"
                  style={{ textAlign: "left", fontSize: 26, padding: "7px 16px", marginRight: -3, background: tab === t ? "#0b0b0c" : "transparent", color: tab === t ? "var(--paper)" : "#0b0b0c", border: "none", cursor: "pointer", borderLeft: tab === t ? "8px solid var(--tape)" : "8px solid transparent" }}
                >
                  <span className="typewriter" style={{ fontSize: 13, opacity: 0.6, marginRight: 10 }}>{String(i + 1).padStart(2, "0")}</span>
                  {t}
                </button>
              ))}
              <div className="typewriter" style={{ marginTop: "auto", fontSize: 13, color: "#555", paddingRight: 20 }}>← → to flip pages · Esc to close<br />Numbers shown are the live rulebook.</div>
            </div>
            <div style={{ flex: 1, padding: "36px 46px", overflow: "auto", position: "relative" }}>
              <button onClick={close} className="display" style={{ position: "absolute", right: 24, top: 18, fontSize: 28, background: "transparent", border: "2px solid #0b0b0c", padding: "2px 14px", cursor: "pointer" }}>CLOSE ✕</button>
              <Page tab={tab} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const H = ({ children }: { children: React.ReactNode }) => (
  <div className="display" style={{ fontSize: 64, lineHeight: 1, color: "#0b0b0c", marginBottom: 12 }}>{children}</div>
);
const P = ({ children, big = false }: { children: React.ReactNode; big?: boolean }) => (
  <p className="typewriter" style={{ fontSize: big ? 24 : 19, lineHeight: 1.45, color: "#1b1b1d", margin: "0 0 12px", maxWidth: 940 }}>{children}</p>
);
const Chip = ({ children, bg = "#0b0b0c", fg = "var(--paper)" }: { children: React.ReactNode; bg?: string; fg?: string }) => (
  <span className="stencil" style={{ display: "inline-block", background: bg, color: fg, padding: "1px 9px", fontSize: 16, margin: "0 3px" }}>{children}</span>
);

function Page({ tab }: { tab: Tab }) {
  switch (tab) {
    case "THE GOAL":
      return (
        <>
          <H>KNOCK THEM OUT.</H>
          <P big>A one-on-one card duel. Each turn <b>both</b> players secretly pick <b>one</b> move, lock it in, and reveal <b>at the same moment</b>. There are no dice — the result depends only on what you picked against what they picked.</P>
          <P>So you don&apos;t win by luck. You win by <b>reading</b>: how much Grit they have, what matchup they&apos;re in, what they did last turn — and by being hard to read yourself.</P>
          <div style={{ display: "flex", gap: 26, marginTop: 24 }}>
            {[["1", "Bring a corner", "Fighters + a Dirty Trick."], ["2", "Pick in secret", "One move per turn."], ["3", "Reveal together", "Switch → Trick → Attack."], ["4", "First to the KO target", `Lite ${LITE.koTarget} KO · Full ${FULL.koTarget} KOs.`]].map(([n, t, d]) => (
              <div key={n} style={{ width: 210, border: "3px solid #0b0b0c", padding: "14px 16px", transform: `rotate(${(Number(n) - 2.5) * 0.8}deg)` }}>
                <div className="display" style={{ fontSize: 60, color: "var(--tape)", lineHeight: 1 }}>{n}</div>
                <div className="display" style={{ fontSize: 26 }}>{t}</div>
                <div className="typewriter" style={{ fontSize: 15 }}>{d}</div>
              </div>
            ))}
          </div>
          <P>&nbsp;</P>
          <P>Fighters are becoming <b>NFT cards with careers</b>: once on-chain, a card&apos;s record and scars are written by the game itself and nobody can edit them.</P>
        </>
      );
    case "YOUR TURN":
      return (
        <>
          <H>YOUR TURN.</H>
          <P big>Everything that matters is public: <b>HP</b>, <b>Grit</b>, the <b>style matchup</b> and how many <b>tricks</b> are left. Use it.</P>
          {[
            ["PICK", "Choose one action. You can change your mind until you lock in."],
            ["LOCK IN", "A token drops on the table. No take-backs. If the clock runs out you Brace."],
            ["REVEAL", "Silence. Then both choices flip at the same time."],
            ["RESOLVE", "Switch → Dirty Trick → Attack. Everyone gets +1 Grit. A fallen fighter is replaced before the next turn."],
          ].map(([t, d], i) => (
            <div key={t} style={{ display: "flex", gap: 20, alignItems: "baseline", padding: "10px 0", borderBottom: "2px dashed rgba(0,0,0,0.3)", maxWidth: 940 }}>
              <div className="display" style={{ fontSize: 44, color: "var(--tape)", width: 70 }}>{i + 1}</div>
              <div className="display" style={{ fontSize: 34, width: 190 }}>{t}</div>
              <div className="typewriter" style={{ fontSize: 19, lineHeight: 1.35 }}>{d}</div>
            </div>
          ))}
          <P>&nbsp;</P>
          <P>Once the game is on-chain (coming), <b>not locking in or not revealing will be a forfeit</b> — so losing is always better than stalling.</P>
        </>
      );
    case "THE MOVES":
      return (
        <>
          <H>FIVE MOVES.</H>
          {[
            ["ATTACK 1 / 2", "Spend Grit and hit their active fighter. Every fighter has one LIGHT and one HEAVY attack."],
            ["BRACE", "Guard. Fully blocks a LIGHT attack. A HEAVY attack breaks it and still deals ⅔. +1 Grit (only the first Brace in a row)."],
            ["SWITCH", `Swap in a fighter from your corner. Costs the leaving fighter's retreat in Grit. Resolves BEFORE attacks — their hit lands on your new fighter. Free if they didn't attack.`],
            ["DIRTY TRICK", `Flip a face-down trick. Costs ${TRICK_COST} Grit. Once per bout. Tricks resolve before attacks.`],
            ["TIMEOUT", "If you don't lock in: Brace (sparring). Once on-chain: forfeit."],
          ].map(([t, d]) => (
            <div key={t} style={{ display: "flex", gap: 20, padding: "9px 0", borderBottom: "2px dashed rgba(0,0,0,0.25)", maxWidth: 960 }}>
              <div className="display" style={{ fontSize: 32, width: 220, flexShrink: 0 }}>{t}</div>
              <div className="typewriter" style={{ fontSize: 18.5, lineHeight: 1.35 }}>{d}</div>
            </div>
          ))}
        </>
      );
    case "GUARD TRIANGLE":
      return (
        <>
          <H>THE GUARD TRIANGLE.</H>
          <P big>This is the heart of the game. Attacks are <Chip>LIGHT</Chip> (cost ≤ 2) or <Chip bg="var(--tape)" fg="#0b0b0c">HEAVY</Chip> (cost ≥ 3).</P>
          <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
            <Triangle nodes={["BRACE", "LIGHT", "HEAVY"]} edges={["blocks", "interrupts", "breaks guard"]} />
            <div style={{ maxWidth: 560 }}>
              <P><b>Brace beats LIGHT</b> — a Brace blocks a light attack completely (0 damage).</P>
              <P><b>HEAVY beats Brace</b> — it breaks your guard and still deals ⅔ of its damage.</P>
              <P><b>LIGHT beats HEAVY</b> — if both swing at once, the light attack interrupts and the heavy deals only half.</P>
              <P>Guess right and you win the turn. Guess wrong and you eat it. Heavy costs more Grit, so <b>you can only throw one when you can afford it — and they know it.</b></P>
              <P><b>GRAPPLE</b> attacks ignore Brace entirely. <b>COUNTER</b> attacks punish a Switch. A <b>Switch</b> is free if they don&apos;t attack.</P>
            </div>
          </div>
        </>
      );
    case "STYLES & RIDERS":
      return (
        <>
          <H>STYLES & RIDERS.</H>
          <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
            <Triangle nodes={["BRAWL", "CLINCH", "SLICK"]} edges={["×1.5", "×1.5", "×1.5"]} colors={[STYLE_STAMP_BG[0], STYLE_STAMP_BG[1], STYLE_STAMP_BG[2]]} />
            <div style={{ maxWidth: 580 }}>
              <P><b>BRAWL beats CLINCH beats SLICK beats BRAWL.</b> With the matchup your hit deals ×1.5 (rounded up); at a disadvantage ×⅔ (rounded down, never below 1).</P>
              <P><Chip>PIERCE</Chip> ignores a bad matchup.</P>
              <P><Chip>GRAPPLE</Chip> ignores Brace. (CLINCH)</P>
              <P><Chip>COUNTER</Chip> +2 damage if they Switched this turn. (SLICK)</P>
              <P>Your active fighter&apos;s style is on its poster. The HUD tells you <b>▲ ADVANTAGE</b> or <b>▼ BAD MATCHUP</b> every turn.</P>
            </div>
          </div>
        </>
      );
    case "GRIT":
      return (
        <>
          <H>GRIT.</H>
          <div style={{ display: "flex", gap: 40, alignItems: "center", margin: "6px 0 14px" }}>
            <Matches grit={3} cap={GRIT_CAP} size={1.6} />
            <div className="typewriter" style={{ fontSize: 18 }}>Lit sticks are spendable. Max {GRIT_CAP}.</div>
          </div>
          <P big>Grit pays for everything: attacks, switching out, tricks.</P>
          <P>You gain <b>+1 at the end of every turn</b>, and <b>+1 more</b> for a Brace (only the first in a row — Bracing forever gains nothing).</P>
          <P>Grit is <b>public</b>. At 1 Grit your opponent can&apos;t throw a heavy — you can <b>see</b> what they can afford, and they can see you. That is the clock the whole mind-game runs on.</P>
        </>
      );
    case "WINNING":
      return (
        <>
          <H>WINNING.</H>
          <P big><b>KO</b> — a fighter at 0 HP is out. Reach the KO target to win.</P>
          <P><b>Double KO</b> — if both sides would win in the same turn, the last fighters re-enter at <b>half HP</b> for <b>SUDDEN DEATH</b>: the next KO wins.</P>
          <P><b>Turn cap</b> — if nobody gets there it&apos;s a <b>decision</b>: most KOs, then most remaining HP, then most damage dealt.</P>
          <P><b>Forfeit</b> — once on-chain, failing to lock in or reveal loses the bout.</P>
          <P>When a fighter goes down you choose the next one from your corner. They are revealed <b>before</b> the next turn starts, so nobody is guessing blind.</P>
        </>
      );
    case "FORMATS":
      return (
        <>
          <H>LITE &amp; FULL.</H>
          <table className="typewriter" style={{ fontSize: 19, borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>{["", "LITE — First Blood", "FULL — Main Card"].map((h) => <th key={h} className="display" style={{ fontSize: 28, textAlign: "left", padding: "6px 22px 6px 0", borderBottom: "3px solid #0b0b0c" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {[
                ["Fighters / Tricks", `${LITE.fighters} / ${LITE.tricks}`, `${FULL.fighters} / ${FULL.tricks}`],
                ["KOs to win", LITE.koTarget, FULL.koTarget],
                ["Turn cap", `${LITE.turnCap} turns`, `${FULL.turnCap} turns`],
                ["Starting Grit", LITE.startGrit, FULL.startGrit],
                ["HP scale", `${LITE.hpPct}%`, `${FULL.hpPct}%`],
                ["Your corner is…", "public (only your lead is secret)", "hidden until used"],
                ["Feels like", "a quick draw (~1 min)", "a real fight (~3 min)"],
              ].map(([k, a, b]) => (
                <tr key={String(k)}>
                  <td style={{ padding: "7px 22px 7px 0", borderBottom: "1px dashed rgba(0,0,0,0.3)", fontWeight: 700 }}>{k}</td>
                  <td style={{ padding: "7px 22px 7px 0", borderBottom: "1px dashed rgba(0,0,0,0.3)" }}>{a}</td>
                  <td style={{ padding: "7px 22px 7px 0", borderBottom: "1px dashed rgba(0,0,0,0.3)" }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <P>&nbsp;</P>
          <P><b>Full on the ledger:</b> you register a pool of 8 cards and secretly choose which 3 fighters and 2 tricks to bring. A card is shown only when you play it. The two exceptions: if a bout is still tied at the turn cap, or goes to sudden death, the fighters you haven&apos;t used yet must be shown — refuse and you forfeit.</P>
          <P>Same cards work in both. <b>Spreads</b> trade toughness for mobility: {SPREADS.map((s) => `${s.name} (HP ${s.hp}, retreat ${s.retreat})`).join(" · ")}. HP is scaled by the format.</P>
        </>
      );
    case "THE CARDS":
      return (
        <>
          <H>THE CARDS.</H>
          <div style={{ display: "flex", gap: 30 }}>
            {[0, 1, 2].map((st) => (
              <div key={st} style={{ flex: 1 }}>
                <Stamp color={STYLE_STAMP_BG[st as 0 | 1 | 2]} filled size={20} rotate={-2}>
                  <span style={{ color: st === 0 ? "#0b0b0c" : "var(--paper)" }}>{STYLE_NAMES[st]}</span>
                </Stamp>
                <table className="typewriter" style={{ fontSize: 15, marginTop: 10, borderCollapse: "collapse", width: "100%" }}>
                  <tbody>
                    {ATTACKS.filter((a) => a.style === st).map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px dashed rgba(0,0,0,0.3)" }}>
                        <td style={{ padding: "3px 4px", fontWeight: 700 }}>{a.name}</td>
                        <td style={{ padding: "3px 4px", color: isHeavy(a.cost) ? "var(--tape-dim)" : "#333" }}>{isHeavy(a.cost) ? "HEAVY" : "LIGHT"}</td>
                        <td style={{ padding: "3px 4px", whiteSpace: "nowrap" }}>{a.cost}● → <b>{a.dmg}</b></td>
                        <td style={{ padding: "3px 4px", fontSize: 12, color: "#555" }}>{a.tag === TAG.GRAPPLE ? "grapple" : a.tag === TAG.COUNTER ? "counter" : a.tag === TAG.PIERCE ? "pierce" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="stencil" style={{ fontSize: 15, color: "var(--tape-dim)", letterSpacing: "0.2em", margin: "16px 0 6px" }}>DIRTY TRICKS · {TRICK_COST} GRIT · ONCE PER BOUT</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 24px" }}>
            {TRICKS.map((t) => (
              <div key={t.id} className="typewriter" style={{ fontSize: 14.5, lineHeight: 1.3 }}>
                <b className="display" style={{ fontSize: 20 }}>{t.name}</b> — {t.text}
              </div>
            ))}
          </div>
          <P>&nbsp;</P>
          <P>A fighter = one style + <b>one LIGHT and one HEAVY attack</b> of that style + a spread. Pick your own in the Locker, or start from a preset.</P>
        </>
      );
    case "CONTROLS":
      return (
        <>
          <H>CONTROLS.</H>
          <table className="typewriter" style={{ fontSize: 22, borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["1 / 2", "Attack 1 / Attack 2"],
                ["3", "Brace"],
                ["4 / 5", "Switch to your first / second benched fighter"],
                ["T / Y", "Dirty Trick 1 / 2"],
                ["Enter / Space", "Lock in"],
                ["Esc", "Clear your pick · close this manual"],
                ["Mouse", "Click any card. Hover for numbers. Nudge the mouse to look around the table."],
              ].map(([k, d]) => (
                <tr key={k}>
                  <td style={{ padding: "8px 30px 8px 0" }}>
                    <span className="display" style={{ background: "#0b0b0c", color: "var(--paper)", padding: "2px 14px", fontSize: 26 }}>{k}</span>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <P>&nbsp;</P>
          <P>Settings in the bottom-left corner: <b>sound</b>, <b>motion</b> (reduce motion / flashes), <b>view</b> (table / flat), <b>quality</b>.</P>
        </>
      );
  }
}

/** a three-node cycle diagram: edges[i] labels the arrow nodes[i] → nodes[(i+1)%3] */
function Triangle({ nodes, edges, colors }: { nodes: [string, string, string]; edges: [string, string, string]; colors?: readonly string[] }) {
  const pts = [
    [210, 56],
    [372, 330],
    [48, 330],
  ] as const;
  const mid = (a: readonly [number, number], b: readonly [number, number], k = 0.5) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] as const;
  return (
    <svg width="430" height="410" viewBox="0 0 420 400" style={{ flexShrink: 0 }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#0b0b0c" />
        </marker>
      </defs>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % 3]!;
        const a = mid(p, q, 0.22);
        const b = mid(p, q, 0.78);
        const m = mid(p, q, 0.5);
        const cx = 210;
        const cy = 235;
        const off: [number, number] = [(m[0] - cx) * 0.22, (m[1] - cy) * 0.22];
        return (
          <g key={i}>
            <path d={`M${a[0]},${a[1]} Q${m[0] + off[0]},${m[1] + off[1]} ${b[0]},${b[1]}`} stroke="#0b0b0c" strokeWidth="5" fill="none" markerEnd="url(#arr)" />
            <text x={m[0] + off[0] * 2.3} y={m[1] + off[1] * 2.3} textAnchor="middle" fontFamily="var(--font-type)" fontSize="19" fill="#8a2a0a" fontWeight="700">{edges[i]}</text>
          </g>
        );
      })}
      {pts.map((p, i) => (
        <g key={nodes[i]}>
          <rect x={p[0] - 66} y={p[1] - 26} width="132" height="52" fill={colors?.[i] ?? "#0b0b0c"} transform={`rotate(${(i - 1) * 3} ${p[0]} ${p[1]})`} />
          <text x={p[0]} y={p[1] + 11} textAnchor="middle" fontFamily="var(--font-display)" fontSize="34" fill={colors?.[i] === "#ff5a1f" ? "#0b0b0c" : "#f5f1e6"}>{nodes[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export { STYLE_COLOR };
