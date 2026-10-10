"use client";

import { useEffect, useRef, useState } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Fixed 1920×1080 design surface scaled to fit the window (letterboxed). */
export function Stage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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
    </div>
  );
}
