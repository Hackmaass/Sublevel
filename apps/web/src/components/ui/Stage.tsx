"use client";

import { useEffect, useRef, useState } from "react";
import { useViewport } from "@/lib/viewport";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Fixed 1920×1080 design surface scaled to fit the window (letterboxed). */
export function Stage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const vp = useViewport();
  const [playAnyway, setPlayAnyway] = useState(false);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#050506", overflow: "hidden" }}>
      <div
        ref={ref}
        className={className}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
      {vp?.portraitPhone && !playAnyway && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000, background: "radial-gradient(ellipse at 50% 30%, #3a2f1f, #0b0b0c 70%)", display: "grid", placeItems: "center", padding: 28, textAlign: "center" }}>
          <div style={{ maxWidth: 360 }}>
            <div style={{ fontSize: 64, lineHeight: 1, transform: "rotate(-90deg)", display: "inline-block", animation: "rotateHint 2.2s ease-in-out infinite" }}>📱</div>
            <div style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: 40, lineHeight: 1.05, marginTop: 14, color: "var(--paper)" }}>TURN YOUR PHONE SIDEWAYS</div>
            <div style={{ fontFamily: "var(--font-type)", fontSize: 15, color: "var(--smear)", marginTop: 10, lineHeight: 1.4 }}>SUBLEVEL is a landscape game: the table needs the width.</div>
            <a href="/watch" style={{ display: "block", marginTop: 22, fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: 26, padding: "12px 0", background: "var(--tape)", color: "#0b0b0c", textDecoration: "none" }}>
              JUST WATCH THE FIGHT →
            </a>
            <div style={{ fontFamily: "var(--font-type)", fontSize: 12, color: "var(--smear)", marginTop: 8 }}>Spectators read each move on their phone — it works upright.</div>
            <button onClick={() => setPlayAnyway(true)} style={{ marginTop: 18, background: "none", border: "none", color: "var(--smear)", textDecoration: "underline", fontFamily: "var(--font-type)", fontSize: 13 }}>
              play anyway (tiny)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
