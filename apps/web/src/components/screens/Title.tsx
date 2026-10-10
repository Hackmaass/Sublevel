"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PRESETS } from "@sublevel/engine";
import { portraitDataUrl } from "@/lib/portrait";
import { unlockAudio } from "@/lib/sfx";
import { useGame } from "@/lib/game";
import { Stamp, Tape } from "../ui/Marks";
import { sfx } from "@/lib/sfx";
import { tutorialDone } from "@/lib/tutorial";

export function Title() {
  const goLobby = useGame((s) => s.goLobby);
  const quickStart = useGame((s) => s.quickStart);
  const startTutorial = useGame((s) => s.startTutorial);
  // browser-only storage: read after mount so server and client render the same first frame
  const [seen, setSeen] = useState(true);
  useEffect(() => setSeen(tutorialDone()), []);
  const learn = () => {
    unlockAudio();
    sfx.bell();
    startTutorial();
  };
  const enter = () => {
    unlockAudio();
    sfx.bell();
    // first time through the door: the scripted first fight comes before the locker
    if (!tutorialDone()) startTutorial();
    else goLobby();
  };
  const quick = () => {
    unlockAudio();
    quickStart();
  };
  const L = PRESETS[0]!;
  const R = PRESETS[7]!;

  return (
    <div className="grain" style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 1100px 900px at 50% -8%, #5a4a30 0%, #2a2218 34%, #0a0a0b 76%)" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.2, backgroundImage: "repeating-linear-gradient(45deg, transparent 0 24px, #aaa 24px 25.5px), repeating-linear-gradient(-45deg, transparent 0 24px, #aaa 24px 25.5px)", maskImage: "linear-gradient(180deg,#000,transparent 75%)", WebkitMaskImage: "linear-gradient(180deg,#000,transparent 75%)" }} />
      {/* bulb */}
      <div className="flicker" style={{ position: "absolute", left: "50%", top: 0, width: 4, height: 120, background: "#111", transform: "translateX(-50%)" }} />
      <div className="flicker" style={{ position: "absolute", left: "50%", top: 112, width: 56, height: 70, borderRadius: "50% 50% 45% 45%", transform: "translateX(-50%)", background: "radial-gradient(circle at 50% 40%, #fff6d8, #ffc766 55%, #b57b22)", boxShadow: "0 0 120px 60px rgba(255,190,90,0.5), 0 0 380px 160px rgba(255,170,60,0.2)" }} />

      {/* poster */}
      <motion.div
        initial={{ y: -60, opacity: 0, rotate: -5 }}
        animate={{ y: 0, opacity: 1, rotate: -1.6 }}
        transition={{ type: "spring", stiffness: 90, damping: 14 }}
        className="paper"
        style={{ position: "absolute", left: "50%", top: 190, width: 1240, height: 700, marginLeft: -620, padding: "30px 46px", boxShadow: "0 40px 90px rgba(0,0,0,0.75)", clipPath: "polygon(0 1%, 2% 0, 98% 1.2%, 100% 3%, 99% 98%, 97% 100%, 3% 99%, 0.4% 97%)" }}
      >
        <Tape w={150} h={34} rotate={-6} style={{ left: 60, top: -14 }} />
        <Tape w={150} h={34} rotate={5} style={{ right: 60, top: -14 }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 25% 25%, rgba(0,0,0,0.1) 1px, transparent 1.4px)", backgroundSize: "5px 5px", pointerEvents: "none" }} />
        <div className="stencil" style={{ fontSize: 26, color: "#2b2b2d", letterSpacing: "0.34em" }}>TONIGHT · DOORS AT NINE · BRING A PEN</div>
        <div className="display" style={{ fontSize: 214, lineHeight: 0.92, color: "#0b0b0c", marginTop: 4, letterSpacing: "0.01em" }}>SUBLEVEL</div>
        <div style={{ position: "absolute", left: 40, bottom: 40, width: 270, height: 350, transform: "rotate(-3deg)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portraitDataUrl({ seed: 1, style: L.build.style, wear: 1 })} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 15%", mixBlendMode: "multiply" }} />
        </div>
        <div style={{ position: "absolute", right: 40, bottom: 40, width: 270, height: 350, transform: "rotate(3deg) scaleX(-1)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portraitDataUrl({ seed: 8, style: R.build.style, wear: 2 })} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 15%", mixBlendMode: "multiply" }} />
        </div>
        <div style={{ position: "absolute", left: 340, right: 340, bottom: 40, textAlign: "center" }}>
          <div className="marker" style={{ fontSize: 40, color: "#0b0b0c", transform: "rotate(-2deg)" }}>every move is secret.</div>
          <div className="marker" style={{ fontSize: 40, color: "var(--tape-dim)", transform: "rotate(1.5deg)" }}>every card remembers.</div>
          <div className="typewriter" style={{ fontSize: 17, color: "#2b2b2d", marginTop: 16, lineHeight: 1.4 }}>
            A one-on-one card duel of secret, simultaneous moves. Fighters are NFT cards with careers nobody can edit. Built for Monad.
          </div>
        </div>
        <div style={{ position: "absolute", right: 56, top: 70, width: 400, transform: "rotate(1.6deg)" }}>
          <div className="stencil" style={{ fontSize: 18, letterSpacing: "0.28em", color: "#555" }}>THE CARD</div>
          {[["MAIN EVENT", "LITE — first blood"], ["CO-MAIN", "FULL — three fighters, two KOs"], ["UNDERCARD", "SPARRING — vs the house"]].map(([a, b]) => (
            <div key={a} style={{ borderBottom: "2px dashed rgba(0,0,0,0.35)", padding: "8px 0" }}>
              <div className="display" style={{ fontSize: 34, color: "#0b0b0c", lineHeight: 1 }}>{a}</div>
              <div className="typewriter" style={{ fontSize: 15, color: "#2b2b2d" }}>{b}</div>
            </div>
          ))}
          <div style={{ marginTop: 18 }}>
            <Stamp color="var(--blood)" size={20} rotate={-5}>SPARRING · OFFLINE BUILD</Stamp>
          </div>
        </div>
      </motion.div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 74, display: "flex", justifyContent: "center", gap: 26 }}>
        <div style={{ position: "relative" }}>
          {!seen && (
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 1, repeat: Infinity }} className="marker" style={{ position: "absolute", left: "50%", top: -50, transform: "translateX(-50%) rotate(-4deg)", whiteSpace: "nowrap", fontSize: 28, color: "var(--tape)" }}>
              new here? start here ▼
            </motion.div>
          )}
          <button onClick={learn} className="display" style={seen ? { fontSize: 40, padding: "16px 34px", background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.4)", cursor: "pointer" } : { fontSize: 56, padding: "16px 56px", background: "var(--tape)", color: "#0b0b0c", border: "none", cursor: "pointer", transform: "rotate(-1.2deg)", boxShadow: "0 0 0 3px #0b0b0c, 0 0 0 6px var(--tape), 0 18px 44px rgba(255,90,31,0.4)", clipPath: "polygon(0 6%, 2% 0, 98% 3%, 100% 92%, 97% 100%, 2% 97%)" }}>
            LEARN TO FIGHT
          </button>
        </div>
        <button onClick={enter} className="display" style={seen ? { fontSize: 56, padding: "16px 56px", background: "var(--tape)", color: "#0b0b0c", border: "none", cursor: "pointer", transform: "rotate(-1.2deg)", boxShadow: "0 0 0 3px #0b0b0c, 0 0 0 6px var(--tape), 0 18px 44px rgba(255,90,31,0.4)", clipPath: "polygon(0 6%, 2% 0, 98% 3%, 100% 92%, 97% 100%, 2% 97%)" } : { fontSize: 40, padding: "16px 34px", background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.4)", cursor: "pointer" }}>
          ENTER THE BASEMENT
        </button>
        <button onClick={() => useGame.getState().openManual()} className="display" style={{ fontSize: 40, padding: "16px 34px", background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.4)", cursor: "pointer" }}>
          HOW TO PLAY
        </button>
        <button onClick={quick} className="display" style={{ fontSize: 40, padding: "16px 34px", background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.4)", cursor: "pointer" }}>
          QUICK FIGHT
        </button>
      </div>
      <div className="typewriter" style={{ position: "absolute", left: 0, right: 0, bottom: 22, textAlign: "center", fontSize: 14, color: "var(--smear)" }}>
        Monad testnet · chain 10143 · on-chain commit–reveal comes online in the next milestone — this build plays locally against a sparring bot.
      </div>
    </div>
  );
}
