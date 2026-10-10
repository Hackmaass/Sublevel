"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game";
import { sfx } from "@/lib/sfx";
import { FighterPoster } from "./FighterPoster";
import { Stamp } from "./ui/Marks";
import { takeaway, tape } from "@/lib/readback";
import { roomReadLine, useRoom } from "@/lib/room";
import { useChain } from "@/lib/chainGame";
import { addressUrl, isLocalChain } from "@/lib/monad";

export function ResultOverlay() {
  const bout = useGame((s) => s.bout);
  const meta = useGame((s) => s.meta);
  const goLobby = useGame((s) => s.goLobby);
  const goTitle = useGame((s) => s.goTitle);
  const quickStart = useGame((s) => s.quickStart);
  const history = useGame((s) => s.history);

  useEffect(() => {
    const id = setTimeout(() => sfx.stamp(), 650);
    return () => clearTimeout(id);
  }, []);

  const [showTape, setShowTape] = useState(false);
  const roomTurns = useRoom((s) => s.turns);
  const roomOn = useRoom((s) => s.on);
  const onChain = useGame((s) => !!s.chain);
  const ledger = useChain((s) => s.ledger);
  const deployment = useChain((s) => s.deployment);
  const boutId = useChain((s) => s.boutId);
  const chainAgain = useChain((s) => s.start);
  if (!bout?.result) return null;
  const r = bout.result;
  const won = r.winner === 0;
  const draw = r.winner === 2;
  const me = bout.sides[0];
  const best = me.fighters.reduce((a, b, i) => (b.hp > (me.fighters[a]?.hp ?? -1) ? i : a), 0);
  const word = draw ? "DRAW" : won ? "YOU WIN" : "YOU LOSE";
  const color = draw ? "var(--smear)" : won ? "var(--tape)" : "var(--blood)";
  const reason = r.reason === "ko" ? "by knockout" : r.reason === "decision" ? "by decision" : r.reason === "forfeit" ? "by forfeit" : "nobody could separate them";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, zIndex: 80, background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.82), rgba(0,0,0,0.97))", display: "grid", placeItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 90 }}>
        <motion.div initial={{ rotate: -14, y: -400, opacity: 0 }} animate={{ rotate: -4, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.15 }}>
          <FighterPoster fighter={me.fighters[best]!} name={meta.name[0][best] ?? "YOU"} seed={meta.seed[0][best] ?? 1} wear={won ? 1 : 3} />
        </motion.div>
        <div style={{ textAlign: "center" }}>
          <motion.div initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.5 }}>
            <Stamp color={color} size={130} filled>
              {word}
            </Stamp>
          </motion.div>
          <div className="typewriter" style={{ fontSize: 24, marginTop: 22, color: "var(--paper)" }}>{reason} · {bout.turn} turns</div>
          <div className="typewriter" style={{ fontSize: 15, marginTop: 6, color: "var(--smear)" }}>
            {won ? "A new mark is pressed into the card." : draw ? "Both cards remember it." : "The card remembers. So does the room."}
          </div>
          <div className="typewriter" style={{ fontSize: 13, marginTop: 4, color: "var(--smear)" }}>
            {history.length} exchanges · {me.dealt} damage dealt · {bout.sides[1].dealt} taken
          </div>
          {onChain && (
            <div className="typewriter" style={{ fontSize: 14, marginTop: 8, color: "var(--paper)" }}>
              ⛓ {ledger.length} transactions on {isLocalChain ? "a local test chain" : "Monad testnet"} · avg {ledger.length ? Math.round(ledger.reduce((a, t) => a + t.ms, 0) / ledger.length) : 0} ms to land · bout #{boutId}
              {deployment && (
                <>
                  {" "}·{" "}
                  <a href={addressUrl(deployment.arena)} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>
                    the Arena on the explorer
                  </a>
                </>
              )}
            </div>
          )}
          {roomOn && roomTurns.length > 0 && (
            <div className="typewriter" style={{ fontSize: 15, marginTop: 8, color: "var(--paper)" }}>
              The room read you on <span style={{ color: "var(--tape)" }}>{roomReadLine(roomTurns, history.length).you}</span> of {roomReadLine(roomTurns, history.length).of} turns
              {" "}— and them on <span style={{ color: "var(--tape)" }}>{roomReadLine(roomTurns, history.length).them}</span>.
              <span style={{ color: "var(--smear)" }}> (house readers + any phones)</span>
            </div>
          )}
          {history.length > 0 && !draw && (
            <div className="marker" style={{ fontSize: 19, marginTop: 18, color: "var(--tape)", maxWidth: 560, marginLeft: "auto", marginRight: "auto", lineHeight: 1.3, transform: "rotate(-0.8deg)" }}>
              {takeaway(history, won)}
            </div>
          )}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 34 }}>
            <button onClick={() => (onChain ? (goTitle(), void chainAgain()) : quickStart())} className="display" style={btn("var(--tape)", "#0b0b0c")}>{onChain ? "ANOTHER ON-CHAIN DUEL" : "REMATCH"}</button>
            <button onClick={() => setShowTape(true)} className="display" style={btn("var(--paper)", "#0b0b0c")}>THE TAPE</button>
            <button onClick={goLobby} className="display" style={btn("var(--paper)", "#0b0b0c")}>THE LOCKER</button>
            <button onClick={goTitle} className="display" style={btn("transparent", "var(--paper)", true)}>LEAVE</button>
          </div>
        </div>
      </div>
      {showTape && <Tape rows={tape(history)} onClose={() => setShowTape(false)} />}
    </motion.div>
  );
}

/** The post-bout tape: every turn, what each side played, and who read whom. */
function Tape({ rows, onClose }: { rows: ReturnType<typeof tape>; onClose: () => void }) {
  const color = { read: "var(--ok)", outread: "var(--blood)", even: "var(--smear)" } as const;
  const label = { read: "YOU READ IT", outread: "OUT-READ", even: "EVEN" } as const;
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.88)", display: "grid", placeItems: "center", cursor: "pointer" }}>
      <div className="paper" onClick={(e) => e.stopPropagation()} style={{ width: 1280, maxHeight: 880, overflow: "auto", padding: "30px 40px", cursor: "default", boxShadow: "0 30px 80px rgba(0,0,0,0.8)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="display" style={{ fontSize: 54, color: "#0b0b0c" }}>THE TAPE</div>
          <button onClick={onClose} className="display" style={{ fontSize: 26, padding: "2px 18px", background: "#0b0b0c", color: "var(--paper)", border: "none", cursor: "pointer" }}>CLOSE</button>
        </div>
        <div className="typewriter" style={{ fontSize: 14, color: "#555", marginBottom: 14 }}>Every turn, as it happened. Green = you read them. Red = they read you.</div>
        {rows.map((r) => (
          <div key={r.turn} style={{ display: "grid", gridTemplateColumns: "56px 250px 250px 150px 1fr", gap: 14, alignItems: "center", padding: "9px 0", borderTop: "2px dashed rgba(0,0,0,0.25)" }}>
            <div className="display" style={{ fontSize: 34, color: "#0b0b0c" }}>{r.turn}</div>
            <div><div className="typewriter" style={{ fontSize: 11, color: "#666" }}>YOU</div><div className="display" style={{ fontSize: 24, color: "#0b0b0c" }}>{r.me}</div></div>
            <div><div className="typewriter" style={{ fontSize: 11, color: "#666" }}>THEM</div><div className="display" style={{ fontSize: 24, color: "#0b0b0c" }}>{r.opp}</div></div>
            <Stamp color={color[r.verdict]} size={14} rotate={-2}>{label[r.verdict]}</Stamp>
            <div className="typewriter" style={{ fontSize: 15, color: "#1c1c1e" }}>{r.why}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function btn(bg: string, fg: string, outline = false): React.CSSProperties {
  return {
    fontSize: 34,
    padding: "10px 28px",
    background: bg,
    color: fg,
    border: outline ? "2px solid rgba(245,241,230,0.4)" : "none",
    cursor: "pointer",
    transform: "rotate(-1deg)",
    clipPath: "polygon(0 6%, 3% 0, 98% 3%, 100% 90%, 96% 100%, 2% 96%)",
  };
}
