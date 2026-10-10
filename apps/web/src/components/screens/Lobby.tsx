"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ATTACKS, FULL, LITE, SPREADS, STYLE_NAMES, TRICKS, type FighterBuild, type FormatRules, type Loadout } from "@sublevel/engine";
import { FighterPoster } from "../FighterPoster";
import { Stamp, Tape } from "../ui/Marks";
import { useGame, type Difficulty } from "@/lib/game";
import { sfx, unlockAudio } from "@/lib/sfx";
import { STYLE_COLOR } from "@/lib/describe";
import { type FighterState } from "@sublevel/engine";
import { Workbench } from "../Workbench";
import { MAX_CUSTOM, loadCustoms, presetEntries, saveCustoms, type RosterEntry } from "@/lib/roster";

const asFighter = (b: FighterBuild, fmt: FormatRules): FighterState => {
  const hp = Math.max(1, Math.floor((SPREADS[b.spread]!.hp * fmt.hpPct) / 100));
  return { build: b, maxHp: hp, hp, retreat: SPREADS[b.spread]!.retreat, revealed: true, alive: true };
};

export function Lobby() {
  const startMatch = useGame((s) => s.startMatch);
  const goTitle = useGame((s) => s.goTitle);
  const difficulty = useGame((s) => s.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const [format, setFormat] = useState<FormatRules>(LITE);
  const [customs, setCustoms] = useState<RosterEntry[]>([]);
  const [tab, setTab] = useState<"house" | "yours">("house");
  const [bench, setBench] = useState(false);
  const [picked, setPicked] = useState<string[]>(["p:0", "p:7"]);
  useEffect(() => {
    setCustoms(loadCustoms()); // browser-only storage: read after mount so server and client render the same first frame
  }, []);
  const roster = useMemo(() => [...presetEntries, ...customs], [customs]);
  const entry = (k: string): RosterEntry => roster.find((e) => e.key === k) ?? presetEntries[0]!;
  const wall = tab === "house" ? presetEntries : customs;
  const [tricks, setTricks] = useState<number[]>([0]);
  const [lead, setLead] = useState(0);

  const need = format.fighters;
  const needT = format.tricks;
  const ready = picked.length === need && tricks.length === needT;

  const toggle = (i: string) => {
    sfx.tick();
    setPicked((p) => {
      if (p.includes(i)) {
        const n = p.filter((x) => x !== i);
        setLead(0);
        return n;
      }
      if (p.length >= need) return [...p.slice(1), i];
      return [...p, i];
    });
  };
  const toggleTrick = (i: number) => {
    sfx.tick();
    setTricks((t) => (t.includes(i) ? t.filter((x) => x !== i) : t.length >= needT ? [...t.slice(1), i] : [...t, i]));
  };

  const go = () => {
    if (!ready) return;
    unlockAudio();
    const es = picked.map(entry);
    const loadout: Loadout = { fighters: es.map((e) => e.build), tricks, lead };
    startMatch(loadout, es.map((e) => e.name), es.map((e) => e.seed), format);
  };

  const cover = useMemo(() => {
    const s = new Set(picked.map((k) => entry(k).build.style));
    return [0, 1, 2].map((x) => s.has(x as 0 | 1 | 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, roster]);

  const switchFormat = (f: FormatRules) => {
    setFormat(f);
    setPicked((p) => p.slice(0, f.fighters).concat(f.fighters > p.length ? ["p:3", "p:6"].slice(0, f.fighters - p.length) : []).slice(0, f.fighters));
    setTricks((t) => t.slice(0, f.tricks).concat(f.tricks > t.length ? [1, 3].slice(0, f.tricks - t.length) : []).slice(0, f.tricks));
    setLead(0);
  };

  return (
    <div className="grain" style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 1400px 900px at 38% -10%, #3d3425, #17140f 55%, #09090a)" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.14, backgroundImage: "repeating-linear-gradient(0deg, transparent 0 78px, #000 78px 80px), repeating-linear-gradient(90deg, transparent 0 158px, #000 158px 160px)" }} />
      <div style={{ position: "absolute", left: 44, top: 28 }}>
        <div className="stencil" style={{ fontSize: 18, color: "var(--smear)", letterSpacing: "0.3em" }}>THE LOCKER</div>
        <div className="display" style={{ fontSize: 76, lineHeight: 1, color: "var(--paper)" }}>PICK YOUR CORNER</div>
        <div className="typewriter" style={{ fontSize: 16, color: "var(--smear)" }}>
          {format.fighters} fighters + {format.tricks} dirty trick{format.tricks > 1 ? "s" : ""}. Cover the triangle: <span style={{ color: STYLE_COLOR[0] }}>BRAWL</span> beats CLINCH beats <span style={{ color: STYLE_COLOR[2] }}>SLICK</span> beats BRAWL.
        </div>
      </div>

      <button onClick={() => useGame.getState().openManual()} className="display" style={{ position: "absolute", left: 1040, top: 36, fontSize: 28, background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.4)", padding: "4px 18px", cursor: "pointer" }}>
        ? HOW TO PLAY
      </button>

      {/* wall tabs */}
      <div style={{ position: "absolute", left: 830, top: 104, display: "flex", gap: 0 }}>
        {([["house", "HOUSE FIGHTERS"], ["yours", `YOURS (${customs.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => { sfx.tick(); setTab(t); }} className="display" style={{ fontSize: 26, padding: "2px 22px", cursor: "pointer", background: tab === t ? "var(--paper)" : "transparent", color: tab === t ? "#0b0b0c" : "var(--paper)", border: "2px solid rgba(245,241,230,0.5)", borderBottom: tab === t ? "2px solid var(--paper)" : undefined }}>
            {label}
          </button>
        ))}
      </div>

      {/* fighter grid */}
      <div style={{ position: "absolute", left: 44, top: 168, width: 1270, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 18 }}>
        {wall.map((p, i) => {
          const sel = picked.indexOf(p.key);
          return (
            <motion.button
              key={p.key}
              whileHover={{ y: -8, rotate: 0 }}
              onClick={() => toggle(p.key)}
              style={{ position: "relative", background: "none", border: "none", padding: 0, cursor: "pointer", transform: `rotate(${((i * 7) % 5) - 2}deg)`, filter: sel >= 0 ? "none" : "brightness(0.78)", outline: "none" }}
            >
              <FighterPoster fighter={asFighter(p.build, format)} name={p.name} seed={p.seed} compact scale={1.04} />
              {sel >= 0 && (
                <>
                  <div style={{ position: "absolute", inset: -5, border: "4px solid var(--tape)", pointerEvents: "none", boxShadow: "0 0 24px rgba(255,90,31,0.5)" }} />
                  <Tape w={64} h={22} rotate={-8} style={{ left: 8, top: -8 }} />
                  <div className="display" style={{ position: "absolute", left: 14, top: 2, fontSize: 30, color: "var(--toner)" }}>{sel === lead ? "★" : sel + 1}</div>
                </>
              )}
              {p.custom && (
                <span
                  role="button"
                  title="Scrap this fighter"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = customs.filter((c) => c.key !== p.key);
                    setCustoms(next);
                    saveCustoms(next);
                    setPicked((pk) => pk.filter((k) => k !== p.key));
                    setLead(0);
                  }}
                  className="display"
                  style={{ position: "absolute", right: 6, top: 4, width: 30, height: 30, lineHeight: "28px", textAlign: "center", fontSize: 22, background: "var(--blood)", color: "var(--paper)", border: "2px solid #0b0b0c" }}
                >
                  ✕
                </span>
              )}
              <div className="typewriter" style={{ position: "absolute", left: 0, right: 0, bottom: -44, fontSize: 12, color: "var(--smear)", textAlign: "left", lineHeight: 1.2 }}>
                {ATTACKS[p.build.attackIds[0]]!.name} · {ATTACKS[p.build.attackIds[1]]!.name} · {SPREADS[p.build.spread]!.name}
              </div>
            </motion.button>
          );
        })}
        {tab === "yours" && customs.length < MAX_CUSTOM && (
          <motion.button whileHover={{ y: -8 }} onClick={() => { sfx.tick(); setBench(true); }} className="display" style={{ height: 260, border: "4px dashed rgba(245,241,230,0.55)", background: "rgba(245,241,230,0.05)", color: "var(--paper)", cursor: "pointer", fontSize: 40, lineHeight: 1.05 }}>
            + BUILD
            <div className="typewriter" style={{ fontSize: 14, marginTop: 8, color: "var(--smear)" }}>style · attacks · spread</div>
          </motion.button>
        )}
        {tab === "yours" && customs.length === 0 && (
          <div className="typewriter" style={{ gridColumn: "span 5", color: "var(--smear)", fontSize: 18, alignSelf: "center", padding: "0 20px", lineHeight: 1.4 }}>
            Nothing here yet. The house fighters are presets — the Workbench lets you assemble your own from the same modules.
          </div>
        )}
      </div>

      {/* tricks */}
      <div style={{ position: "absolute", left: 44, top: 858, width: 1270 }}>
        <div className="stencil" style={{ fontSize: 16, color: "var(--tape)", letterSpacing: "0.25em", marginBottom: 8 }}>DIRTY TRICKS · pick {needT}</div>
        <div style={{ display: "flex", gap: 14 }}>
          {TRICKS.map((t) => {
            const on = tricks.includes(t.id);
            return (
              <button key={t.id} onClick={() => toggleTrick(t.id)} className="paper" style={{ width: 200, height: 118, padding: "10px 12px", textAlign: "left", cursor: "pointer", border: "none", boxShadow: on ? "0 0 0 4px var(--tape), 0 10px 24px rgba(0,0,0,0.6)" : "0 6px 14px rgba(0,0,0,0.5)", transform: `translateY(${on ? -8 : 0}px) rotate(${(t.id % 3) - 1}deg)`, filter: on ? "none" : "brightness(0.8)", transition: "all 0.12s", clipPath: "polygon(0 3%, 3% 0, 98% 2%, 100% 96%, 97% 100%, 2% 98%)" }}>
                <div className="display" style={{ fontSize: 24, lineHeight: 1, color: "#0b0b0c" }}>{t.name}</div>
                <div className="typewriter" style={{ fontSize: 11.5, lineHeight: 1.25, marginTop: 6, color: "#2b2b2d" }}>{t.text}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* right panel */}
      <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="paper" style={{ position: "absolute", right: 40, top: 60, width: 500, height: 920, padding: "30px 34px", boxShadow: "0 30px 70px rgba(0,0,0,0.7)", transform: "rotate(0.8deg)", clipPath: "polygon(0 0.6%, 3% 0, 98% 0.8%, 100% 3%, 99.4% 99%, 96% 100%, 2% 99.4%, 0 97%)" }}>
        <Tape w={110} h={30} rotate={-5} style={{ left: 200, top: -12 }} />
        <div className="stencil" style={{ fontSize: 16, letterSpacing: "0.3em", color: "#555" }}>TONIGHT&apos;S CARD</div>
        <div className="display" style={{ fontSize: 56, lineHeight: 1, color: "#0b0b0c", marginTop: 6 }}>YOU vs THE HOUSE</div>

        <div style={{ marginTop: 22 }}>
          <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>FORMAT</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[LITE, FULL].map((f) => (
              <button key={f.id} onClick={() => switchFormat(f)} className="display" style={{ flex: 1, padding: "8px 6px", fontSize: 24, cursor: "pointer", background: format.id === f.id ? "#0b0b0c" : "transparent", color: format.id === f.id ? "var(--paper)" : "#0b0b0c", border: "2px solid #0b0b0c" }}>
                {f.id === 0 ? "LITE" : "FULL"}
                <div className="typewriter" style={{ fontSize: 11, letterSpacing: 0 }}>{f.id === 0 ? "first blood · ~1 min" : "3v3 · ~3 min · preview"}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>YOUR CORNER</div>
          {picked.length === 0 && <div className="typewriter" style={{ fontSize: 14, color: "#555" }}>Pick {need} fighters from the wall.</div>}
          {picked.map((k, n) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: "1px dashed rgba(0,0,0,0.3)" }}>
              <button onClick={() => setLead(n)} title="Lead fighter" className="display" style={{ width: 38, height: 38, fontSize: 24, border: "2px solid #0b0b0c", background: lead === n ? "var(--tape)" : "transparent", cursor: "pointer" }}>
                {lead === n ? "★" : n + 1}
              </button>
              <div style={{ flex: 1 }}>
                <div className="display" style={{ fontSize: 26, lineHeight: 1, color: "#0b0b0c" }}>{entry(k).name}</div>
                <div className="typewriter" style={{ fontSize: 12, color: "#444" }}>{STYLE_NAMES[entry(k).build.style]} · {SPREADS[entry(k).build.spread]!.name}{entry(k).custom ? " · yours" : ""}</div>
              </div>
            </div>
          ))}
          <div className="typewriter" style={{ fontSize: 12, color: "#555", marginTop: 8 }}>★ = lead (revealed first). Matchup coverage:</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {["BRAWL", "CLINCH", "SLICK"].map((n, k) => (
              <span key={n} className="stencil" style={{ fontSize: 13, padding: "2px 8px", background: cover[k] ? "#0b0b0c" : "transparent", color: cover[k] ? STYLE_COLOR[k] : "#777", border: "2px solid #0b0b0c", opacity: cover[k] ? 1 : 0.6 }}>{n}</span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>SPARRING PARTNER</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["rookie", "regular", "veteran"] as Difficulty[]).map((d) => (
              <button key={d} onClick={() => setDifficulty(d)} className="typewriter" style={{ flex: 1, padding: "6px 0", fontSize: 14, cursor: "pointer", background: difficulty === d ? "#0b0b0c" : "transparent", color: difficulty === d ? "var(--paper)" : "#0b0b0c", border: "2px solid #0b0b0c" }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div style={{ position: "absolute", left: 34, right: 34, bottom: 30 }}>
          <button onClick={go} disabled={!ready} className="display" style={{ width: "100%", padding: "14px 0", fontSize: 52, background: ready ? "var(--tape)" : "#8a8678", color: "#0b0b0c", border: "none", cursor: ready ? "pointer" : "not-allowed", boxShadow: ready ? "0 0 0 3px #0b0b0c, 0 0 0 6px var(--tape)" : "none", transform: "rotate(-0.8deg)" }}>
            TO THE RING
          </button>
          <button onClick={goTitle} className="typewriter" style={{ marginTop: 14, background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
            ← back to the door
          </button>
          <div style={{ position: "absolute", right: 6, top: -64 }}>
            <Stamp color="var(--blood)" size={18} rotate={8}>HOUSE RULES: NO REFUNDS</Stamp>
          </div>
        </div>
      </motion.div>
      {bench && (
        <Workbench
          format={format}
          existing={customs}
          onClose={() => setBench(false)}
          onSave={(e) => {
            const next = [...customs, e];
            setCustoms(next);
            saveCustoms(next);
            setBench(false);
            setTab("yours");
          }}
        />
      )}
    </div>
  );
}
