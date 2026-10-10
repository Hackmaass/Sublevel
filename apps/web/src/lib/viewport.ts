"use client";

import { useEffect, useState } from "react";

export interface Viewport {
  w: number;
  h: number;
  /** a phone held upright: the 16:9 stage would shrink to an unreadable strip */
  portraitPhone: boolean;
  /** too small for the full set of side panels (room heat, QR card, …) */
  compact: boolean;
  /** touch-first device (no mouse): default to the cheaper 3D tier */
  coarse: boolean;
}

const read = (): Viewport => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { w, h, portraitPhone: w < 820 && h > w * 1.1, compact: w < 1100, coarse: window.matchMedia?.("(pointer: coarse)").matches ?? false };
};

/** Browser-only values are read after mount, so the server and the first client render agree. */
export function useViewport(): Viewport | null {
  const [v, setV] = useState<Viewport | null>(null);
  useEffect(() => {
    const on = () => setV(read());
    on();
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return v;
}
