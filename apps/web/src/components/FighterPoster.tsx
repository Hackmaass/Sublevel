"use client";

import { useMemo } from "react";
import { ATTACKS, STYLE_NAMES, isHeavy, type FighterState } from "@sublevel/engine";
import { portraitDataUrl } from "@/lib/portrait";
import { STYLE_INK, STYLE_STAMP_BG, tornClip } from "@/lib/describe";
import { Stamp, Tally, Tape } from "./ui/Marks";

export interface PosterProps {
  fighter: FighterState;
  name: string;
  seed: number;
  /** size multiplier */
  scale?: number;
  active?: boolean;
  hit?: boolean;
  flip?: boolean;
  showAttacks?: boolean;
  wear?: number;
  compact?: boolean;
}

/** A photocopied fight poster / standee face. Used by the 2D arena, lobby, and as the 3D card texture source. */
export function FighterPoster({ fighter, name, seed, scale = 1, active = false, hit = false, flip = false, showAttacks = true, wear = 0, compact = false }: PosterProps) {
  const known = fighter.build.attackIds[0] >= 0;
  const style = fighter.build.style;
  const src = useMemo(() => portraitDataUrl({ seed, style, wear }), [seed, style, wear]);
  const clip = useMemo(() => tornClip(seed * 3 + 1, 1.2), [seed]);
  const W = compact ? 190 : 330;
  const H = compact ? 250 : 470;
  return (
    <div
      className="paper"
      style={{
        position: "relative",
        width: W * scale,
        height: H * scale,
        clipPath: clip,
        transform: `${flip ? "scaleX(-1)" : ""}`,
        filter: fighter.alive ? (hit ? "brightness(1.5) contrast(1.4)" : "none") : "grayscale(1) brightness(0.7)",
        transition: "filter 0.12s",
        boxShadow: active ? "0 0 0 3px rgba(255,90,31,0.0)" : undefined,
      }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 25% 25%, rgba(0,0,0,0.12) 1px, transparent 1.4px)", backgroundSize: "5px 5px" }} />
      <div style={{ position: "absolute", left: 14 * scale, right: 14 * scale, top: 14 * scale, bottom: (compact ? 56 : showAttacks ? 142 : 74) * scale, overflow: "hidden", background: "#cfc9b6", transform: flip ? "scaleX(-1)" : undefined }}>
        {known ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", display: "block", mixBlendMode: "multiply" }} />
        ) : (
          <div className="display" style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 120 * scale, color: "#1b1b1d", opacity: 0.5 }}>?</div>
        )}
      </div>
      {known && (
        <div style={{ position: "absolute", right: 22 * scale, top: 22 * scale, transform: flip ? "scaleX(-1)" : undefined }}>
          <Stamp color={STYLE_STAMP_BG[style]} size={(compact ? 13 : 19) * scale} rotate={7} filled>
            <span style={{ color: STYLE_INK[style] }}>{STYLE_NAMES[style]}</span>
          </Stamp>
        </div>
      )}
      <div style={{ position: "absolute", left: 16 * scale, right: 16 * scale, bottom: 10 * scale, transform: flip ? "scaleX(-1)" : undefined }}>
        <div className="display" style={{ fontSize: (compact ? 22 : 38) * scale, lineHeight: 1, color: "#0b0b0c" }}>
          {known ? name : "UNKNOWN"}
        </div>
        {!compact && known && (
          <div style={{ marginTop: 4 * scale }}>
            <Tally hp={fighter.hp} max={fighter.maxHp} size={0.8 * scale} color="#0b0b0c" flash={hit} />
          </div>
        )}
        {showAttacks && !compact && known && (
          <div className="typewriter" style={{ marginTop: 6 * scale, fontSize: 14 * scale, lineHeight: 1.25, color: "#1b1b1d" }}>
            {fighter.build.attackIds.map((id) => {
              const t = ATTACKS[id]!;
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {t.name} <b style={{ fontSize: 11, opacity: 0.8 }}>{isHeavy(t.cost) ? "HEAVY" : "LIGHT"}</b>
                  </span>
                  <span>
                    {t.cost}● → {t.dmg}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!fighter.alive && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", transform: flip ? "scaleX(-1)" : undefined }}>
          <Stamp color="#c1272d" size={(compact ? 34 : 78) * scale} rotate={-14} filled>
            KO
          </Stamp>
        </div>
      )}
      {active && <Tape w={80 * scale} h={24 * scale} rotate={-6} style={{ left: "38%", top: -8 * scale }} />}
    </div>
  );
}
