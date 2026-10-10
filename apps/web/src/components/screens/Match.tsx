"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/lib/game";
import { Arena2D } from "../Arena2D";
import { Hud } from "../Hud";
import { ActionBar } from "../ActionBar";
import { FxLayer } from "../FxLayer";
import { ResultOverlay } from "../ResultOverlay";
import { Coach, TutorialResult } from "../Coach";
import { RoomView } from "../RoomView";
import { Ledger } from "../Ledger";
import { useRoom } from "@/lib/room";
import { Stamp } from "../ui/Marks";
import { TableScene, webglAvailable } from "../table/TableScene";

export function Match() {
  const banner = useGame((s) => s.banner);
  const stage = useGame((s) => s.stage);
  const tutorial = useGame((s) => s.tutorial);
  const goTitle = useGame((s) => s.goTitle);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const reduce = useGame((s) => s.reduceMotion);
  const toggleReduce = useGame((s) => s.toggleReduceMotion);
  const renderer = useGame((s) => s.renderer);
  const setRenderer = useGame((s) => s.setRenderer);
  const quality = useGame((s) => s.quality);
  const setQuality = useGame((s) => s.setQuality);
  const [gl, setGl] = useState<boolean | null>(null);
  const roomOn = useRoom((s) => s.on);
  const toggleRoom = useRoom((s) => s.toggle);

  const toggleQr = useRoom((s) => s.toggleQr);

  useEffect(() => {
    const ok = webglAvailable();
    setGl(ok);
    const q = new URLSearchParams(window.location.search);
    if (q.get("r") === "2d" || !ok) useGame.getState().setRenderer("flat");
    if (q.get("q") === "low") useGame.getState().setQuality("low");
  }, []);

  const flat = <Arena2D />;
  return (
    <div className="grain" style={{ position: "absolute", inset: 0 }}>
      {gl === null ? null : renderer === "table" && gl ? <TableScene fallback={flat} /> : flat}
      <Hud />
      <FxLayer />
      <ActionBar />
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner}
            initial={{ scale: 2.4, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: -3 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            style={{ position: "absolute", left: "50%", top: 440, transform: "translateX(-50%)", zIndex: 50, pointerEvents: "none" }}
          >
            <Stamp color="var(--tape)" size={92} filled>
              {banner}
            </Stamp>
          </motion.div>
        )}
      </AnimatePresence>
      {tutorial && <Coach />}
      {!tutorial && stage !== "over" && <RoomView />}
      {stage !== "over" && <Ledger />}
      {stage === "over" && (tutorial ? <TutorialResult /> : <ResultOverlay />)}
      <div style={{ position: "absolute", left: 20, bottom: 12, zIndex: 60, display: "flex", gap: 8 }}>
        {[
          { label: "? rules", on: () => useGame.getState().openManual() },
          ...(tutorial ? [] : [{ label: roomOn ? "room: on" : "room: off", on: toggleRoom }, { label: "qr", on: toggleQr }]),
          { label: "← exit", on: goTitle },
          { label: muted ? "sound off" : "sound on", on: toggleMute },
          { label: reduce ? "motion: reduced" : "motion: full", on: toggleReduce },
          { label: renderer === "table" ? "view: table" : "view: flat", on: () => setRenderer(renderer === "table" ? "flat" : "table") },
          { label: quality === "high" ? "quality: high" : "quality: low", on: () => setQuality(quality === "high" ? "low" : "high") },
        ].map((b) => (
          <button key={b.label} onClick={b.on} className="typewriter" style={{ background: "rgba(0,0,0,0.55)", color: "var(--smear)", border: "1px solid rgba(245,241,230,0.18)", fontSize: 12, padding: "3px 9px", cursor: "pointer" }}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
