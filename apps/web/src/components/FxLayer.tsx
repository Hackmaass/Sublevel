"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SLOW, useGame, useView, type Fx } from "@/lib/game";
import { FighterPoster } from "./FighterPoster";

/** Renderer-independent overlay: floating numbers, impact inversion flash, replacement picker. */
export function FxLayer() {
  const fx = useGame((s) => s.fx);
  const reveal = useGame((s) => s.reveal);
  const reduce = useGame((s) => s.reduceMotion);
  const clearFx = useGame((s) => s.clearFx);
  const stage = useGame((s) => s.stage);
  const bout = useGame((s) => s.bout);
  const meta = useGame((s) => s.meta);
  const pickReplacement = useGame((s) => s.pickReplacement);
  const view = useView();
  const [flash, setFlash] = useState(0);
  const last = useRef(-1);

  useEffect(() => {
    if (reveal?.step === 2 && last.current !== 2 && !reduce && reveal.events.some((e) => e.t === "attack" && e.dmg > 0)) setFlash((n) => n + 1);
    last.current = reveal?.step ?? -1;
  }, [reveal, reduce]);

  const scheduled = useRef(new Set<number>());
  useEffect(() => {
    for (const f of fx) {
      if (scheduled.current.has(f.id)) continue;
      scheduled.current.add(f.id);
      setTimeout(() => {
        clearFx(f.id);
        scheduled.current.delete(f.id);
      }, Math.max(0, f.at + 1500 * SLOW - performance.now()));
    }
  }, [fx, clearFx]);

  const pos = (s: number) => (s === 0 ? 510 : 1410);
  const numeric = (f: Fx) => (f.kind === "hit" && (f.value ?? 0) > 0) || f.kind === "heal" || f.kind === "ko";
  const bigNum = (f: Fx) => (f.kind === "hit" ? ((f.value ?? 0) > 0 ? `−${f.value}` : f.text ?? "") : f.kind === "heal" ? `+${f.value}` : f.kind === "ko" ? "KO" : f.text ?? "");

  return (
    <>
      <AnimatePresence>
        {fx.map((f) => (
          <motion.div
            key={f.id}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: -90, opacity: 1, scale: 1.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 16 }}
            className="display"
            style={{
              position: "absolute",
              left: pos(f.side) - 160,
              top: 330,
              width: 320,
              textAlign: "center",
              fontSize: f.kind === "ko" ? 120 : numeric(f) ? 96 : 54,
              color: f.kind === "heal" ? "var(--ok)" : f.kind === "ko" ? "var(--blood)" : f.adv && f.adv > 0 ? "#ffd24a" : "var(--tape)",
              textShadow: "0 4px 0 #0b0b0c, 0 0 28px rgba(255,90,31,0.6)",
              zIndex: 40,
              pointerEvents: "none",
            }}
          >
            {bigNum(f)}
            {f.kind === "hit" && (f.value ?? 0) > 0 && f.text && <div className="stencil" style={{ fontSize: 22, color: "var(--paper)", textShadow: "0 2px 0 #000" }}>{f.text}</div>}
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.div key={`f${flash}`} initial={{ opacity: flash ? 0.85 : 0 }} animate={{ opacity: 0 }} transition={{ duration: 0.14 }} style={{ position: "absolute", inset: 0, background: "#f5f1e6", mixBlendMode: "difference", pointerEvents: "none", zIndex: 35 }} />

      {stage === "replace" && bout && view && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 45, display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div className="display" style={{ fontSize: 64, color: "var(--tape)" }}>YOUR FIGHTER IS DOWN</div>
            <div className="typewriter" style={{ fontSize: 18, marginBottom: 24 }}>Choose who steps in. They are revealed before the next turn.</div>
            <div style={{ display: "flex", gap: 30, justifyContent: "center" }}>
              {bout.sides[0].fighters.map((f, i) =>
                f.alive && i !== bout.sides[0].active ? (
                  <button key={i} onClick={() => pickReplacement(i)} style={{ background: "none", border: "none", cursor: "pointer", transform: "rotate(-1deg)" }}>
                    <FighterPoster fighter={f} name={meta.name[0][i] ?? "?"} seed={meta.seed[0][i] ?? i + 1} scale={0.8} />
                  </button>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
