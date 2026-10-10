"use client";

import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { A, ATTACKS, TRICKS, TUTORIAL_STEPS, legalActions, type Action } from "@sublevel/engine";
import { actionInfo, STYLE_COLOR } from "@/lib/describe";
import { useGame, useView } from "@/lib/game";
import { sfx } from "@/lib/sfx";

/** The decision surface: 1-5 hotkeys, Space/Enter locks in, Esc clears. Always legible (never diegetic-only). */
export function ActionBar() {
  const bout = useView();
  const stage = useGame((s) => s.stage);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const lock = useGame((s) => s.lock);
  const tutorial = useGame((s) => s.tutorial);
  // in a lesson exactly one move is allowed: it glows, the rest wait their turn
  const allowed: Action | undefined = tutorial && stage === "choose" ? TUTORIAL_STEPS[tutorial.lesson]?.me : undefined;

  const legal = useMemo(() => (bout && stage === "choose" ? legalActions(bout, 0) : []), [bout, stage]);
  const me = bout?.sides[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage !== "choose" || !bout || useGame.getState().manualOpen) return;
      const map: Record<string, Action> = { "1": A.ATTACK1, "2": A.ATTACK2, "3": A.BRACE, t: A.TRICK0, y: A.TRICK1 };
      const k = e.key.toLowerCase();
      if (map[k] !== undefined) {
        if (legal.includes(map[k]!)) {
          select(map[k]!);
          sfx.tick();
        }
      } else if (k === "4" || k === "5") {
        const sw = legal.filter((a) => a >= A.SWITCH0 && a <= A.SWITCH2);
        const pick = sw[k === "4" ? 0 : 1];
        if (pick !== undefined) {
          select(pick);
          sfx.tick();
        }
      } else if (k === "enter" || k === " ") {
        e.preventDefault();
        lock();
      } else if (k === "escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, bout, legal, select, lock]);

  if (!bout || !me) return null;
  const active = me.fighters[me.active]!;

  const tiles: { a: Action; hotkey: string }[] = [
    { a: A.ATTACK1, hotkey: "1" },
    { a: A.ATTACK2, hotkey: "2" },
    { a: A.BRACE, hotkey: "3" },
  ];
  const switches = me.fighters.map((f, i) => ({ f, i })).filter(({ f, i }) => i !== me.active && f.alive);
  switches.forEach((_, n) => tiles.push({ a: (A.SWITCH0 + switches[n]!.i) as Action, hotkey: String(4 + n) }));
  me.tricks.forEach((t, i) => !t.used && tiles.push({ a: (A.TRICK0 + i) as Action, hotkey: i === 0 ? "T" : "Y" }));

  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 210, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18, padding: "0 60px 34px", zIndex: 30 }}>
      {tiles.map(({ a, hotkey }) => {
        const info = actionInfo(bout, 0, a);
        const ok = legal.includes(a);
        const sel = selected === a;
        const isAtk = info.kind === "attack";
        const notYet = allowed !== undefined && a !== allowed;
        const glow = allowed !== undefined && a === allowed && selected === null;
        const tpl = isAtk ? ATTACKS[active.build.attackIds[a === A.ATTACK1 ? 0 : 1]!]! : null;
        const switchTarget = info.kind === "switch" ? me.fighters[info.slot!]! : null;
        const trickTpl = info.kind === "trick" ? TRICKS[me.tricks[a - A.TRICK0]!.id] : null;
        return (
          <div key={a} style={{ position: "relative" }}>
            {glow && <Pointer />}
          <button
            disabled={!ok}
            onClick={() => {
              select(sel ? null : a);
              sfx.tick();
            }}
            className="paper"
            style={{
              position: "relative",
              width: 250,
              height: sel ? 168 : 146,
              padding: "14px 16px 12px",
              textAlign: "left",
              cursor: ok ? "pointer" : "not-allowed",
              opacity: notYet ? 0.34 : ok || stage !== "choose" ? (stage === "choose" ? 1 : 0.55) : 0.38,
              transform: `translateY(${sel ? -14 : 0}px) rotate(${sel ? 0 : ((a % 3) - 1) * 0.7}deg)`,
              transition: "transform 0.14s, height 0.14s, box-shadow 0.14s, opacity 0.2s",
              boxShadow: sel ? "0 0 0 4px var(--tape), 0 14px 28px rgba(0,0,0,0.6)" : "0 6px 14px rgba(0,0,0,0.5)",
              border: "none",
              clipPath: "polygon(0 2%, 3% 0, 97% 1%, 100% 4%, 99% 97%, 96% 100%, 4% 99%, 1% 95%)",
            }}
          >
            <span className="display" style={{ position: "absolute", right: 12, top: 8, fontSize: 22, opacity: 0.55, color: "#0b0b0c" }}>
              {hotkey}
            </span>
            <div className="display" style={{ fontSize: 30, lineHeight: 1, color: "#0b0b0c" }}>{info.title}</div>
            {info.kind === "switch" && switchTarget && <div className="typewriter" style={{ fontSize: 14, marginTop: 4 }}>→ slot {info.slot! + 1}{state(switchTarget)}</div>}
            {info.kind !== "switch" && <div className="typewriter" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.25, color: "#2b2b2d", minHeight: 34 }}>{info.sub || (isAtk ? "straight damage" : "")}</div>}
            {tpl && (
              <div style={{ position: "absolute", left: 16, bottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
                <span className="display" style={{ fontSize: 34, color: STYLE_COLOR[tpl.style] === "#f5f1e6" ? "#0b0b0c" : STYLE_COLOR[tpl.style] }}>{tpl.dmg}</span>
                <span className="typewriter" style={{ fontSize: 12 }}>dmg</span>
                {info.cls && (
                  <span className="stencil" style={{ fontSize: 12, padding: "1px 7px", background: info.cls === "HEAVY" ? "var(--tape)" : "#0b0b0c", color: info.cls === "HEAVY" ? "#0b0b0c" : "var(--paper)" }}>{info.cls}</span>
                )}
              </div>
            )}
            <div style={{ position: "absolute", right: 14, bottom: 10, display: "flex", gap: 4, alignItems: "center" }}>
              <span className="typewriter" style={{ fontSize: 12 }}>{info.cost > 0 ? `costs ${info.cost}` : "free"}</span>
              {Array.from({ length: info.cost }).map((_, i) => (
                <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--blood)" }} />
              ))}
            </div>
            {trickTpl && <span className="stencil" style={{ position: "absolute", left: 14, top: -10, background: "var(--toner)", color: "var(--tape)", fontSize: 12, padding: "2px 8px" }}>DIRTY TRICK</span>}
            {!ok && !notYet && stage === "choose" && (
              <span className="stencil" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.38)", color: "#f5f1e6", fontSize: 18 }}>
                NOT ENOUGH GRIT
              </span>
            )}
            {ok && notYet && (
              <span className="stencil" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.4)", color: "#f5f1e6", fontSize: 18 }}>
                NOT THIS TURN
              </span>
            )}
          </button>
          </div>
        );
      })}
      <div style={{ position: "relative" }}>
        {tutorial && stage === "choose" && selected !== null && <Pointer wide />}
      <button
        onClick={lock}
        disabled={stage !== "choose" || selected === null}
        className="display"
        style={{
          width: 230,
          height: 120,
          marginLeft: 16,
          fontSize: 44,
          letterSpacing: "0.05em",
          background: stage === "choose" && selected !== null ? "var(--tape)" : "#2a2a2d",
          color: stage === "choose" && selected !== null ? "#0b0b0c" : "#6b6b6e",
          border: "none",
          cursor: stage === "choose" && selected !== null ? "pointer" : "not-allowed",
          transform: "rotate(-1.5deg)",
          boxShadow: stage === "choose" && selected !== null ? "0 0 0 3px #0b0b0c, 0 0 0 6px var(--tape), 0 14px 34px rgba(255,90,31,0.35)" : "none",
          transition: "all 0.15s",
          clipPath: "polygon(0 4%, 2% 0, 98% 2%, 100% 8%, 99% 96%, 97% 100%, 3% 98%, 0 93%)",
        }}
      >
        {stage === "waiting" ? "LOCKED" : "LOCK IN"}
        <div className="typewriter" style={{ fontSize: 13, letterSpacing: 0, marginTop: 2 }}>[Enter]</div>
      </button>
      </div>
    </div>
  );
}

function state(f: { hp: number; maxHp: number; build: { style: number } }): string {
  return f.maxHp > 0 ? ` · ${f.hp}/${f.maxHp} hp` : "";
}

/** a pulsing tape ring + bobbing arrow: "this one" */
function Pointer({ wide = false }: { wide?: boolean }) {
  return (
    <>
      <motion.div
        animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.03, 1] }}
        transition={{ duration: 1.1, repeat: Infinity }}
        style={{ position: "absolute", inset: wide ? -10 : -12, border: "4px dashed var(--tape)", borderRadius: 6, pointerEvents: "none", zIndex: 0 }}
      />
      <motion.div
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="display"
        style={{ position: "absolute", left: 0, right: 0, top: wide ? -56 : -60, textAlign: "center", color: "var(--tape)", fontSize: 38, textShadow: "0 0 14px rgba(255,90,31,0.7)", pointerEvents: "none" }}
      >
        ▼
      </motion.div>
    </>
  );
}
