"use client";

import { useEffect, useRef } from "react";
import { PRESETS, SPREADS } from "@sublevel/engine";
import { portraitDataUrl } from "@/lib/portrait";
import { posterCanvas } from "@/components/table/textures";

/** Throwaway art lab: confirms the procedural portraits and canvas posters look right. */
export default function Lab() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < 3; i++) {
        const p = PRESETS[i]!;
        const hp = SPREADS[p.build.spread]!.hp;
        const c = await posterCanvas({ fighter: { build: p.build, hp, maxHp: hp, retreat: 1, revealed: true, alive: true }, name: p.name, seed: i + 1 });
        if (!alive) return;
        c.style.width = "260px";
        c.style.background = "#2a2a2e";
        c.style.margin = "8px";
        host.current?.appendChild(c);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div style={{ height: "100vh", overflow: "auto", padding: 24, background: "#1b1b1d" }}>
      <h1 className="display" style={{ fontSize: 40, margin: 0 }}>Portrait lab</h1>
      <div ref={host} style={{ display: "flex", marginTop: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, marginTop: 16 }}>
        {PRESETS.map((p, i) => (
          <div key={p.name} className="paper" style={{ padding: 10, position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portraitDataUrl({ seed: i + 1, style: p.build.style, wear: 0 })} alt={p.name} style={{ width: "100%", display: "block" }} />
            <div className="display" style={{ fontSize: 22 }}>{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
