"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { A, ATTACKS, type Action, type BoutState, type Side } from "@sublevel/engine";
import { useGame, useView } from "@/lib/game";
import { actionInfo, STYLE_COLOR } from "@/lib/describe";
import { FighterPoster } from "./FighterPoster";

/** Concrete wall + bulb + table + chalk ring, with the two standees, corners, reveal cards and impact FX. 2D "Low tier". */
export function Arena2D() {
  const shown = useView();
  const meta = useGame((s) => s.meta);
  const reveal = useGame((s) => s.reveal);
  const reduce = useGame((s) => s.reduceMotion);

  const fx = useGame((s) => s.fx);
  const bout = useGame((s) => s.bout);
  const [shake, setShake] = useState(0);
  const lastStep = useRef<number>(-1);

  useEffect(() => {
    if (reveal?.step === 2 && lastStep.current !== 2 && !reduce && reveal.events.some((e) => e.t === "attack" && e.dmg > 0)) setShake((n) => n + 1);
    lastStep.current = reveal?.step ?? -1;
  }, [reveal, reduce]);

  const lunge = useMemo(() => {
    const out: [number, number] = [0, 0];
    if (reveal?.step === 2) {
      for (const e of reveal.events) if (e.t === "attack") out[e.side] = e.side === 0 ? 150 : -150;
    }
    return out;
  }, [reveal]);

  if (!shown) return null;

  const side = (s: Side) => shown.sides[s];
  const pos = (s: Side) => (s === 0 ? 510 : 1410);
  const hitFx = (s: Side) => fx.some((f) => f.kind === "hit" && f.side === s && performance.now() - f.at < 380);

  return (
    <motion.div
      key={shake}
      animate={reduce ? {} : { x: [0, -14, 12, -8, 6, 0], y: [0, 8, -6, 4, -2, 0] }}
      transition={{ duration: 0.38 }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* wall */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 900px 700px at 50% 0%, #4a4332 0%, #231f19 38%, #0c0c0d 78%)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 58px, rgba(0,0,0,0.5) 58px 60px), repeating-linear-gradient(90deg, transparent 0 118px, rgba(0,0,0,0.5) 118px 120px)",
        }}
      />
      {/* chain-link */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 700,
          opacity: 0.12,
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 22px, #bbb 22px 23.5px), repeating-linear-gradient(-45deg, transparent 0 22px, #bbb 22px 23.5px)",
          maskImage: "linear-gradient(180deg, #000 0%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 100%)",
        }}
      />
      {/* bulb */}
      <div className="flicker" style={{ position: "absolute", left: "50%", top: 0, width: 4, height: 100, background: "#111", transform: "translateX(-50%)" }} />
      <div
        className="flicker"
        style={{
          position: "absolute",
          left: "50%",
          top: 92,
          width: 46,
          height: 58,
          borderRadius: "50% 50% 45% 45%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle at 50% 40%, #fff6d8, #ffc766 55%, #b57b22)",
          boxShadow: "0 0 90px 40px rgba(255,190,90,0.55), 0 0 280px 120px rgba(255,170,60,0.22)",
        }}
      />
      <div style={{ position: "absolute", left: "50%", top: 150, width: 1100, height: 760, transform: "translateX(-50%)", background: "radial-gradient(ellipse 50% 60% at 50% 20%, rgba(255,200,120,0.20), transparent 70%)", pointerEvents: "none" }} />

      {/* table */}
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          top: 700,
          bottom: -40,
          background: "linear-gradient(180deg, #2c2118 0%, #3a2a1c 14%, #1e150e 100%)",
          borderTop: "6px solid #5a4430",
          boxShadow: "inset 0 18px 40px rgba(0,0,0,0.6), 0 -30px 60px rgba(0,0,0,0.5)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          top: 706,
          bottom: -40,
          opacity: 0.42,
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0 140px, rgba(0,0,0,0.5) 140px 143px), repeating-linear-gradient(180deg, rgba(255,230,190,0.06) 0 2px, transparent 2px 7px)",
        }}
      />
      {/* chalk ring */}
      <div style={{ position: "absolute", left: "50%", top: 640, width: 1040, height: 220, transform: "translateX(-50%)", border: "5px solid rgba(245,241,230,0.55)", borderRadius: "50%", boxShadow: "0 0 18px rgba(245,241,230,0.18), inset 0 0 40px rgba(245,241,230,0.05)", filter: "url(#rough)" }} />
      <div style={{ position: "absolute", left: "50%", top: 744, transform: "translateX(-50%)", width: 4, height: 70, background: "rgba(245,241,230,0.35)" }} />

      {/* corners (bench) */}
      {([0, 1] as Side[]).map((s) => (
        <div key={s} style={{ position: "absolute", top: 560, [s === 0 ? "left" : "right"]: 26, display: "flex", gap: 10, flexDirection: s === 0 ? "row" : "row-reverse" }}>
          {side(s).fighters.map((f, i) =>
            i === side(s).active ? null : (
              <div key={i} style={{ opacity: f.alive ? 1 : 0.6, transform: `rotate(${(i * 3 - 3) * (s === 0 ? 1 : -1)}deg)` }}>
                <FighterPoster fighter={f} name={meta.name[s][i] ?? "?"} seed={meta.seed[s][i] ?? i + 1} compact scale={0.78} flip={s === 1} />
              </div>
            ),
          )}
        </div>
      ))}

      {/* active fighters */}
      {([0, 1] as Side[]).map((s) => {
        const sd = side(s);
        const f = sd.fighters[sd.active]!;
        const idx = sd.active;
        return (
          <motion.div
            key={`${s}-${idx}`}
            initial={{ y: -120, opacity: 0, rotate: s === 0 ? -6 : 6 }}
            animate={{ y: 0, opacity: 1, rotate: s === 0 ? -1.2 : 1.2, x: lunge[s] }}
            transition={{ type: "spring", stiffness: 260, damping: 18, x: { type: "spring", stiffness: 520, damping: 22 } }}
            style={{ position: "absolute", left: pos(s) - 165, top: 262, width: 330, zIndex: 8 }}
          >
            <div style={{ position: "absolute", left: 20, right: 20, bottom: -18, height: 40, background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.65), transparent 70%)" }} />
            <FighterPoster fighter={f} name={meta.name[s][idx] ?? "?"} seed={meta.seed[s][idx] ?? idx + 1} active hit={hitFx(s)} flip={s === 1} />
          </motion.div>
        );
      })}

      {/* reveal cards */}
      <AnimatePresence>
        {reveal && bout && (
          <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", left: "50%", top: 330, transform: "translateX(-50%)", display: "flex", gap: 56, zIndex: 15 }}>
            {([0, 1] as Side[]).map((s) => (
              <ActionCard key={s} side={s} action={reveal.actions[s]} before={reveal.before} flipped={reveal.step >= 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
      </svg>
    </motion.div>
  );
}

function ActionCard({ side, action, before, flipped }: { side: Side; action: Action; before: BoutState; flipped: boolean }) {
  const info = actionInfo(before, side, action);
  const tpl = info.kind === "attack" ? ATTACKS[before.sides[side].fighters[before.sides[side].active]!.build.attackIds[action === A.ATTACK1 ? 0 : 1]!] : null;
  return (
    <div style={{ perspective: 900, width: 224, height: 304 }}>
      <motion.div animate={{ rotateY: flipped ? 0 : 180 }} transition={{ type: "spring", stiffness: 160, damping: 16 }} style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
        {/* face */}
        <div className="paper" style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", padding: 18, boxShadow: "0 24px 50px rgba(0,0,0,0.65)", clipPath: "polygon(0 2%, 3% 0, 97% 1%, 100% 3%, 99% 97%, 96% 100%, 3% 99%, 1% 96%)" }}>
          <div className="stencil" style={{ fontSize: 14, color: "#555" }}>{side === 0 ? "YOU" : "THEM"} · {info.cls ? `${info.cls} ATTACK` : info.kind.toUpperCase()}</div>
          <div className="display" style={{ fontSize: 44, lineHeight: 1, marginTop: 10, color: "#0b0b0c" }}>{info.title}</div>
          <div className="typewriter" style={{ fontSize: 14, marginTop: 10, color: "#2b2b2d", lineHeight: 1.3 }}>{info.sub}</div>
          {tpl && <div className="display" style={{ position: "absolute", left: 18, bottom: 14, fontSize: 72, color: STYLE_COLOR[tpl.style] === "#f5f1e6" ? "#0b0b0c" : STYLE_COLOR[tpl.style] }}>{tpl.dmg}</div>}
          <div className="typewriter" style={{ position: "absolute", right: 18, bottom: 18, fontSize: 13 }}>{info.cost > 0 ? `−${info.cost} grit` : "free"}</div>
        </div>
        {/* back */}
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "repeating-linear-gradient(45deg,#1d1d20 0 10px,#26262a 10px 20px)", border: "6px solid #0b0b0c", display: "grid", placeItems: "center", boxShadow: "0 24px 50px rgba(0,0,0,0.65)" }}>
          <span className="display" style={{ fontSize: 90, color: "var(--tape)", opacity: 0.85 }}>{side === 0 ? "◆" : "?"}</span>
        </div>
      </motion.div>
    </div>
  );
}
