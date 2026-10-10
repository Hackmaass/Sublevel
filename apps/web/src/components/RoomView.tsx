"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CLASS_NAMES } from "@sublevel/engine";
import { useGame } from "@/lib/game";
import { useRoom } from "@/lib/room";
import { sfx } from "@/lib/sfx";
import { useViewport } from "@/lib/viewport";
import { useJoinUrl, useQr } from "./JoinCard";
import { Stamp } from "./ui/Marks";

const panel: React.CSSProperties = {
  position: "absolute",
  width: 300,
  padding: "12px 16px 12px",
  background: "linear-gradient(180deg, rgba(20,20,22,0.92), rgba(11,11,12,0.88))",
  border: "1px solid rgba(245,241,230,0.14)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  zIndex: 19,
};

/** The projector's view of the room: sealed while a turn is being decided, revealed (and scored) one turn late. */
export function RoomView() {
  const on = useRoom((s) => s.on);
  const open = useRoom((s) => s.windowOpen);
  const locked = useRoom((s) => s.locked);
  const spectators = useRoom((s) => s.spectators);
  const turns = useRoom((s) => s.turns);
  const roar = useRoom((s) => s.roar);
  const bots = useRoom((s) => s.bots);
  const meta = useGame((s) => s.meta);
  const bout = useGame((s) => s.bout);
  const code = useRoom((s) => s.code);
  const onChain = useGame((s) => !!s.chain);
  const vp = useViewport();
  const relay = useRoom((s) => s.relay);
  const { url: joinUrl } = useJoinUrl();
  const chipQr = useQr(relay === "online" ? joinUrl : null);

  useEffect(() => {
    if (!roar) return;
    sfx.stamp();
    const id = setTimeout(() => useRoom.setState((s) => (s.roar?.id === roar.id ? { roar: null } : {})), 1900);
    return () => clearTimeout(id);
  }, [roar]);

  if (!on || !bout || !vp || vp.compact) return null; // the side panels need room; a phone-sized window gets the fight itself
  const last = turns[turns.length - 1];
  const board = [...spectators].sort((a, b) => b.points - a.points).slice(0, 5);
  const phones = spectators.filter((s) => s.human).length;
  const house = spectators.length - phones;
  const nameOf = (side: 0 | 1) => {
    const s = bout.sides[side];
    return meta.name[side][s.active] ?? (side === 0 ? "YOU" : "THEM");
  };

  const heat = (side: 0 | 1) => {
    const counts = last?.heat[side] ?? [];
    const total = counts.reduce((a, b) => a + b, 0);
    return (
      <div style={{ ...panel, ...(side === 0 ? { left: 28, top: 196 } : { right: 28, top: 196 }) }}>
        <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.22em", color: "var(--smear)" }}>
          {last ? `TURN ${last.turn + 1} · THE ROOM SAID` : "THE ROOM"}
        </div>
        <div className="display" style={{ fontSize: 26, color: "var(--paper)", lineHeight: 1.1, marginBottom: 6 }}>
          {nameOf(side)}
        </div>
        {last ? (
          CLASS_NAMES.map((label, c) => {
            const pct = total ? (counts[c] ?? 0) / total : 0;
            const played = last.actual[side] === c;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, height: 24, marginBottom: 2 }}>
                <span className="typewriter" style={{ width: 58, fontSize: 12, color: played ? "var(--tape)" : "var(--smear)" }}>
                  {label}
                </span>
                <div style={{ flex: 1, height: 14, background: "rgba(245,241,230,0.07)", position: "relative" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(pct * 100)}%` }}
                    transition={{ type: "spring", stiffness: 160, damping: 20 }}
                    style={{ height: "100%", background: played ? "var(--tape)" : "rgba(245,241,230,0.55)" }}
                  />
                </div>
                <span className="typewriter" style={{ width: 34, fontSize: 12, textAlign: "right", color: played ? "var(--tape)" : "var(--smear)" }}>
                  {Math.round(pct * 100)}%
                </span>
                <span style={{ width: 14, color: "var(--tape)", fontSize: 12 }}>{played ? "◀" : ""}</span>
              </div>
            );
          })
        ) : (
          <div className="typewriter" style={{ fontSize: 13, color: "var(--smear)", lineHeight: 1.35 }}>
            Picks are sealed. The room's read of each turn is revealed one turn late — the fighters never see it coming.
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {heat(0)}
      {heat(1)}

      {/* status + phone hint */}
      <div style={{ ...panel, right: 28, top: 420, padding: "10px 16px", display: "flex", gap: 12, alignItems: "center" }}>
        {chipQr && (
          <button
            onClick={() => useRoom.setState({ qrBig: true })}
            title="show the big QR code"
            style={{ flex: "none", width: 92, height: 92, padding: 3, background: "#f5f1e6", border: "2px solid var(--tape)", cursor: "pointer" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={chipQr} alt="QR chip: click to enlarge" style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }} />
          </button>
        )}
        <div>
          <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.22em", color: "var(--smear)" }}>
            {bots ? `${house} HOUSE BOTS · ` : ""}{phones} {phones === 1 ? "PHONE" : "PHONES"}
          </div>
          <div className="typewriter" style={{ fontSize: 14, marginTop: 4, color: open ? "var(--tape)" : "var(--smear)" }}>
            {spectators.length === 0 ? "○ waiting for phones" : open ? `● ${locked}/${spectators.length} locked` : "○ window shut"}
          </div>
          <div className="typewriter" style={{ fontSize: 12, marginTop: 6, color: "var(--smear)", lineHeight: 1.3 }}>
            {bots ? "house bots fill the room. " : "real phones only. "}join code <span style={{ color: "var(--paper)" }}>{code || "…"}</span>
            {chipQr ? " · click the QR" : ""}
          </div>
        </div>
      </div>

      {/* leaderboard (the Ledger takes this spot in an on-chain duel) */}
      {!onChain && <div style={{ ...panel, left: 28, top: 420, padding: "10px 16px" }}>
        <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.22em", color: "var(--smear)", marginBottom: 4 }}>
          BEST READERS
        </div>
        {board.length === 0 && (
          <div className="typewriter" style={{ fontSize: 13, color: "var(--smear)", lineHeight: 1.35, maxWidth: 260 }}>
            No readers yet. Scan the QR to be the first.
          </div>
        )}
        {board.map((sp, i) => (
          <div key={sp.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, height: 22, color: sp.human ? "var(--tape)" : "var(--paper)" }} className="typewriter">
            <span>
              {i + 1}. {sp.name}
              {!sp.human && <span style={{ color: "var(--smear)", fontSize: 11 }}> · house</span>}
            </span>
            <span>{sp.points}</span>
          </div>
        ))}
      </div>}

      <AnimatePresence>
        {roar && (
          <motion.div
            key={roar.id}
            initial={{ scale: 2.2, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -3 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 340, damping: 18 }}
            style={{ position: "absolute", left: "50%", top: 735, transform: "translateX(-50%)", zIndex: 55, pointerEvents: "none", textAlign: "center" }}
          >
            <Stamp color="var(--tape)" size={46} filled>
              THE ROOM CALLED IT
            </Stamp>
            <div className="typewriter" style={{ fontSize: 16, color: "var(--paper)", marginTop: 6, textShadow: "0 2px 8px #000" }}>
              {Math.round(roar.pct * 100)}% read {nameOf(roar.side)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

