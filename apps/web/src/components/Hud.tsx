"use client";

import { useEffect, useState } from "react";
import { A, ATTACKS, STYLE_NAMES, TRICK_COST, type Side } from "@sublevel/engine";
import { STYLE_INK, STYLE_STAMP_BG } from "@/lib/describe";
import { useGame, useView } from "@/lib/game";
import { sfx } from "@/lib/sfx";
import { Matches, Stamp, Tally } from "./ui/Marks";

/** The always-legible 2D overlay: fighter plates, Grit, HP, matchup, timer, lock status. */
export function Hud() {
  const bout = useView();
  const meta = useGame((s) => s.meta);
  const stage = useGame((s) => s.stage);
  const oppLocked = useGame((s) => s.oppLocked);
  const selected = useGame((s) => s.selected);
  const turnEndsAt = useGame((s) => s.turnEndsAt);
  const fx = useGame((s) => s.fx);
  const tutorial = useGame((s) => s.tutorial);
  const onChain = useGame((s) => !!s.chain);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, Math.ceil((turnEndsAt - now) / 1000));
  // sparring: auto-brace when the clock runs out (on-chain: non-reveal = forfeit)
  useEffect(() => {
    if (stage === "choose" && turnEndsAt > 0 && now >= turnEndsAt) {
      const g = useGame.getState();
      g.select(A.BRACE);
      g.lock();
    }
  }, [now, stage, turnEndsAt]);
  useEffect(() => {
    if (stage === "choose" && secs > 0 && secs <= 5) sfx.tick();
  }, [secs, stage]);

  if (!bout) return null;
  const spend = (() => {
    if (selected === null || stage !== "choose") return 0;
    const me = bout.sides[0];
    const f = me.fighters[me.active]!;
    if (selected === A.ATTACK1 || selected === A.ATTACK2) return ATTACKS[f.build.attackIds[selected === A.ATTACK1 ? 0 : 1]!]!.cost;
    if (selected >= A.SWITCH0 && selected <= A.SWITCH2) return f.retreat;
    if (selected === A.TRICK0 || selected === A.TRICK1) return TRICK_COST;
    return 0;
  })();

  const plate = (side: Side) => {
    const s = bout.sides[side];
    const f = s.fighters[s.active]!;
    const left = side === 0;
    const hit = fx.some((x) => x.kind === "hit" && x.side === side && performance.now() - x.at < 500);
    const idx = s.active;
    const name = meta.name[side][idx] ?? "???";
    const opp = bout.sides[(1 - side) as Side];
    const of = opp.fighters[opp.active]!;
    const rel = f.build.attackIds[0] >= 0 && of.build.attackIds[0] >= 0 ? (((f.build.style + 1) % 3 === of.build.style ? 1 : f.build.style === of.build.style ? 0 : -1) as -1 | 0 | 1) : 0;
    return (
      <div
        style={{
          position: "absolute",
          top: 22,
          [left ? "left" : "right"]: 28,
          width: 560,
          padding: "14px 20px 14px",
          background: "linear-gradient(180deg, rgba(20,20,22,0.92), rgba(11,11,12,0.88))",
          border: "1px solid rgba(245,241,230,0.14)",
          boxShadow: hit ? "0 0 0 2px var(--tape)" : "0 10px 30px rgba(0,0,0,0.5)",
          clipPath: "polygon(0 0, 100% 0, 98.5% 100%, 1.5% 97%)",
          transition: "box-shadow 0.2s",
          textAlign: left ? "left" : "right",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexDirection: left ? "row" : "row-reverse" }}>
          <div className="display" style={{ fontSize: 40, lineHeight: 1, color: "var(--paper)" }}>{f.build.attackIds[0] >= 0 ? name : "???"}</div>
          {f.build.attackIds[0] >= 0 && (
            <Stamp color={STYLE_STAMP_BG[f.build.style]} filled size={15} rotate={left ? -4 : 4}>
              <span style={{ color: STYLE_INK[f.build.style] }}>{STYLE_NAMES[f.build.style]}</span>
            </Stamp>
          )}
          <span className="typewriter" style={{ fontSize: 13, color: "var(--smear)", marginLeft: left ? "auto" : 0, marginRight: left ? 0 : "auto" }}>
            {side === 0 ? "YOU" : tutorial ? "COACH'S MAN" : onChain ? "THE HOUSE" : "SPARRING"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: left ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 26, marginTop: 10, flexDirection: left ? "row" : "row-reverse" }}>
          <div>
            <div className="typewriter" style={{ fontSize: 11, color: "var(--smear)", marginBottom: 3 }}>
              HP {f.maxHp > 0 ? `${Math.max(0, f.hp)}/${f.maxHp}` : "?"}
            </div>
            <Tally hp={Math.max(0, f.hp)} max={f.maxHp} size={0.95} flash={hit} />
          </div>
          <div>
            <div className="typewriter" style={{ fontSize: 11, color: "var(--smear)", marginBottom: 3 }}>GRIT {s.grit}</div>
            <Matches grit={s.grit} preview={side === 0 ? spend : 0} size={0.8} />
          </div>
          {rel !== 0 && (
            <div className="stencil" style={{ fontSize: 14, color: rel > 0 ? "var(--ok)" : "var(--blood)", border: `2px solid ${rel > 0 ? "var(--ok)" : "var(--blood)"}`, padding: "2px 8px", alignSelf: "center" }}>
              {rel > 0 ? "▲ ADVANTAGE" : "▼ BAD MATCHUP"}
            </div>
          )}
        </div>
        <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)", marginTop: 8, display: "flex", justifyContent: left ? "flex-start" : "flex-end", gap: 14 }}>
          <span>KOs {s.kos}/{bout.format.koTarget}</span>
          <span>tricks {s.tricks.filter((t) => !t.used).length}</span>
          {side === 1 && stage === "choose" && <span style={{ color: oppLocked ? "var(--tape)" : "var(--smear)" }}>{oppLocked ? "● LOCKED IN" : "○ thinking…"}</span>}
          {side === 0 && stage !== "choose" && stage !== "setup" && <span style={{ color: "var(--tape)" }}>● LOCKED</span>}
        </div>
      </div>
    );
  };

  const urgent = secs <= 5 && stage === "choose";
  return (
    <>
      {plate(0)}
      {plate(1)}
      {/* center: turn + clock */}
      <div style={{ position: "absolute", top: 196, left: "50%", transform: "translateX(-50%)", width: 320, textAlign: "center", zIndex: 21, padding: "6px 0 8px", background: "linear-gradient(180deg, rgba(8,8,9,0.0), rgba(8,8,9,0.55) 30%, rgba(8,8,9,0.55) 80%, rgba(8,8,9,0))" }}>
        <div className="stencil" style={{ fontSize: 15, color: "var(--smear)", letterSpacing: "0.2em" }}>{tutorial ? "FIRST FIGHT" : onChain ? "ON-CHAIN · LITE" : bout.format.name.split(" ")[0]!.toUpperCase()} · {bout.sudden ? "SUDDEN DEATH" : `TURN ${Math.min(bout.turn + 1, bout.format.turnCap)}/${bout.format.turnCap}`}</div>
        <div className="display flicker" style={{ fontSize: 88, lineHeight: 1, color: urgent ? "var(--tape)" : "var(--paper)", textShadow: urgent ? "0 0 24px rgba(255,90,31,0.7)" : "none" }}>
          {tutorial ? `${Math.min(tutorial.lesson + 1, 6)}/6` : onChain ? "LIVE" : stage === "choose" ? String(secs).padStart(2, "0") : "──"}
        </div>
        <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)" }}>
          {stage === "choose" ? (tutorial ? "your lesson — follow the coach" : onChain ? "every move is a transaction · [Enter] to seal" : "pick a move · [Enter] to lock") : stage === "waiting" ? (onChain ? "sealed on-chain · waiting for the house…" : "waiting for the other side…") : stage === "reveal" ? "…" : stage === "replace" ? "choose your next fighter" : ""}
        </div>
      </div>
    </>
  );
}
