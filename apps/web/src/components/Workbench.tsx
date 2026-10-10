"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ATTACKS, SPREADS, STYLE_NAMES, advantage, isHeavy, isLegalBuild, allBuilds, type FighterBuild, type FighterState, type FormatRules, type Style } from "@sublevel/engine";
import { FighterPoster } from "./FighterPoster";
import { Tape } from "./ui/Marks";
import { STYLE_COLOR, STYLE_INK, STYLE_STAMP_BG, TAG_TEXT } from "@/lib/describe";
import { MAX_NAME, nameProblem, newCustom, seedOf, type RosterEntry } from "@/lib/roster";
import { sfx } from "@/lib/sfx";

const STYLE_BLURB = ["Hits hard, pays in Grit.", "Grapples ignore your guard.", "Cheap, quick, counters a Switch."] as const;
const TOTAL_BUILDS = allBuilds().length;

const asFighter = (b: FighterBuild, fmt: FormatRules): FighterState => {
  const hp = Math.max(1, Math.floor((SPREADS[b.spread]!.hp * fmt.hpPct) / 100));
  return { build: b, maxHp: hp, hp, retreat: SPREADS[b.spread]!.retreat, revealed: true, alive: true };
};

/**
 * THE WORKBENCH — build a fighter from modules: one style, ONE light + ONE heavy attack of that style, one spread.
 * Every legal combination is a real, balanced fighter (the same rule the Cards contract enforces at mint), so there is no
 * "wrong" choice to be punished for — only a different plan. A prompt/Booking changes looks and story, never these numbers.
 */
export function Workbench({ format, existing, onSave, onClose }: { format: FormatRules; existing: RosterEntry[]; onSave: (e: RosterEntry) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [style, setStyle] = useState<Style>(0);
  const [light, setLight] = useState<number | null>(null);
  const [heavy, setHeavy] = useState<number | null>(null);
  const [spread, setSpread] = useState(1);

  const pool = useMemo(() => ATTACKS.filter((a) => a.style === style), [style]);
  const lights = pool.filter((a) => !isHeavy(a.cost));
  const heavies = pool.filter((a) => isHeavy(a.cost));
  const L = light ?? lights[0]!.id;
  const H = heavy ?? heavies[0]!.id;
  // when the style changes, the previously picked attacks no longer belong to it
  const lightOk = ATTACKS[L]!.style === style ? L : lights[0]!.id;
  const heavyOk = ATTACKS[H]!.style === style ? H : heavies[0]!.id;
  const build: FighterBuild = { style, attackIds: [lightOk, heavyOk], spread };
  const legal = isLegalBuild(build);
  const problem = nameProblem(name);
  const dup = existing.some((e) => e.build.style === build.style && e.build.attackIds[0] === build.attackIds[0] && e.build.attackIds[1] === build.attackIds[1] && e.build.spread === build.spread);
  const can = legal && !problem;
  const previewSeed = useMemo(() => seedOf(name.trim() || "Nobody"), [name]);

  const save = () => {
    if (!can) return;
    sfx.slam();
    onSave(newCustom(name, build));
  };

  const Pick = ({ a, on, onPick }: { a: (typeof ATTACKS)[number]; on: boolean; onPick: () => void }) => (
    <button
      onClick={() => {
        sfx.tick();
        onPick();
      }}
      className="typewriter"
      style={{ textAlign: "left", padding: "8px 12px", cursor: "pointer", background: on ? "#0b0b0c" : "transparent", color: on ? "var(--paper)" : "#0b0b0c", border: "2px solid #0b0b0c", boxShadow: on ? `4px 4px 0 ${STYLE_STAMP_BG[style]}` : "none", transition: "all 0.1s" }}
    >
      <span className="display" style={{ fontSize: 26, lineHeight: 1 }}>{a.name}</span>
      <span style={{ float: "right", fontSize: 15 }}>{a.dmg} dmg · {a.cost} grit</span>
      {TAG_TEXT[a.tag] && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{TAG_TEXT[a.tag]}</div>}
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(5,5,6,0.82)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <motion.div
        initial={{ y: 50, rotate: -1.5, opacity: 0 }}
        animate={{ y: 0, rotate: 0.4, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="paper"
        style={{ position: "absolute", left: 170, top: 60, width: 1580, height: 960, padding: "30px 40px", boxShadow: "0 40px 90px rgba(0,0,0,0.8)", clipPath: "polygon(0 0.5%, 2% 0, 99% 0.6%, 100% 3%, 99.5% 99%, 97% 100%, 1% 99.4%, 0 97%)" }}
      >
        <Tape w={150} h={34} rotate={-4} style={{ left: 700, top: -14 }} />
        <div className="stencil" style={{ fontSize: 16, letterSpacing: "0.3em", color: "#555" }}>THE WORKBENCH</div>
        <div className="display" style={{ fontSize: 64, lineHeight: 1, color: "#0b0b0c" }}>BUILD A FIGHTER</div>
        <div className="typewriter" style={{ fontSize: 15, color: "#444", maxWidth: 940 }}>
          One style, one light and one heavy attack of that style, one spread. All {TOTAL_BUILDS} combinations are real fighters — no trap builds. A name and a picture are only dressing; they never change what the fighter can do.
        </div>

        <div style={{ display: "flex", gap: 36, marginTop: 20 }}>
          <div style={{ width: 360 }}>
            <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>1 · NAME</div>
            <input
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dutch Marlene"
              className="display"
              style={{ width: "100%", fontSize: 34, padding: "4px 10px", background: "rgba(255,255,255,0.35)", border: "2px solid #0b0b0c", color: "#0b0b0c", outline: "none" }}
            />
            <div className="typewriter" style={{ fontSize: 12, color: name && problem ? "var(--blood)" : "#555", height: 18 }}>{name ? problem ?? "Good name." : "Letters, numbers, space - ' . !"}</div>

            <div className="stencil" style={{ fontSize: 14, color: "#555", margin: "16px 0 6px" }}>2 · STYLE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([0, 1, 2] as Style[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    sfx.tick();
                    setStyle(s);
                    setLight(null);
                    setHeavy(null);
                  }}
                  style={{ textAlign: "left", padding: "8px 14px", cursor: "pointer", background: style === s ? STYLE_STAMP_BG[s] : "transparent", color: style === s ? STYLE_INK[s] : "#0b0b0c", border: "2px solid #0b0b0c", transform: style === s ? "rotate(-0.8deg)" : "none", transition: "all 0.1s" }}
                >
                  <span className="display" style={{ fontSize: 34, lineHeight: 1, color: style === s ? STYLE_INK[s] : STYLE_COLOR[s] === "#f5f1e6" ? "#0b0b0c" : STYLE_COLOR[s] }}>{STYLE_NAMES[s]}</span>
                  <div className="typewriter" style={{ fontSize: 12 }}>{STYLE_BLURB[s]}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 470 }}>
            <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>3 · LIGHT ATTACK <span style={{ opacity: 0.7 }}>(cost ≤ 2 — gets blocked by Brace, interrupts a Heavy)</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lights.map((a) => <Pick key={a.id} a={a} on={lightOk === a.id} onPick={() => setLight(a.id)} />)}
            </div>
            <div className="stencil" style={{ fontSize: 14, color: "#555", margin: "16px 0 6px" }}>4 · HEAVY ATTACK <span style={{ opacity: 0.7 }}>(cost ≥ 3 — breaks a Brace for ⅔)</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {heavies.map((a) => <Pick key={a.id} a={a} on={heavyOk === a.id} onPick={() => setHeavy(a.id)} />)}
            </div>
          </div>

          <div style={{ width: 300 }}>
            <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>5 · SPREAD</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SPREADS.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    sfx.tick();
                    setSpread(sp.id);
                  }}
                  className="typewriter"
                  style={{ textAlign: "left", padding: "8px 12px", cursor: "pointer", background: spread === sp.id ? "#0b0b0c" : "transparent", color: spread === sp.id ? "var(--paper)" : "#0b0b0c", border: "2px solid #0b0b0c" }}
                >
                  <span className="display" style={{ fontSize: 28, lineHeight: 1 }}>{sp.name}</span>
                  <div style={{ fontSize: 13 }}>HP {Math.max(1, Math.floor((sp.hp * format.hpPct) / 100))} · Switching out costs {sp.retreat}</div>
                </button>
              ))}
            </div>
            <div className="typewriter" style={{ fontSize: 12, color: "#444", marginTop: 12, lineHeight: 1.35 }}>
              Toughness and mobility trade off: a Bulky fighter outlasts you but is expensive to pull out; a Nimble one slips away for free.
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 8, alignSelf: "flex-start" }}>THE POSTER</div>
            <div style={{ transform: "rotate(2deg)" }}>
              <FighterPoster fighter={asFighter(build, format)} name={name.trim() || "NOBODY YET"} seed={previewSeed} scale={1.05} />
            </div>
          </div>
        </div>


        {/* fight sheet: what this build means in play (all derived from the rulebook, nothing hand-written per build) */}
        <div className="typewriter" style={{ position: "absolute", left: 590, top: 745, width: 700, fontSize: 15, lineHeight: 1.5, color: "#222", borderTop: "3px solid #0b0b0c", paddingTop: 10 }}>
          <div className="stencil" style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>THE FIGHT SHEET</div>
          <div>
            Strong against <b>{STYLE_NAMES[([0, 1, 2] as Style[]).find((t) => advantage(style, t) === 1)!]}</b> (×1.5) · weak against <b>{STYLE_NAMES[([0, 1, 2] as Style[]).find((t) => advantage(style, t) === -1)!]}</b> (×⅔).
          </div>
          <div>
            You start with <b>{format.startGrit} Grit</b> and gain 1 a turn: the LIGHT {ATTACKS[lightOk]!.name} is {ATTACKS[lightOk]!.cost <= format.startGrit ? "ready from turn 1" : `ready on turn ${ATTACKS[lightOk]!.cost - format.startGrit + 1}`}, the HEAVY {ATTACKS[heavyOk]!.name} is {ATTACKS[heavyOk]!.cost <= format.startGrit ? "ready from turn 1" : `ready on turn ${ATTACKS[heavyOk]!.cost - format.startGrit + 1}`} if you spend nothing else.
          </div>
          <div>
            {SPREADS[spread]!.retreat === 0 ? "Switching out is free." : `Pulling this fighter out costs ${SPREADS[spread]!.retreat} Grit (refunded if the switch isn't punished by an attack).`}
          </div>
        </div>

        <div style={{ position: "absolute", left: 40, right: 40, bottom: 28, display: "flex", alignItems: "center", gap: 22 }}>
          <button onClick={onClose} className="typewriter" style={{ background: "none", border: "none", color: "#555", fontSize: 16, cursor: "pointer", textDecoration: "underline" }}>← cancel</button>
          <div className="typewriter" style={{ flex: 1, fontSize: 14, color: dup ? "var(--blood)" : "#555" }}>
            {dup ? "You already have this exact build — a second copy is allowed, but it's the same fighter with a new face." : `${ATTACKS[lightOk]!.name} + ${ATTACKS[heavyOk]!.name} · ${SPREADS[spread]!.name} ${STYLE_NAMES[style]}`}
          </div>
          <button onClick={save} disabled={!can} className="display" style={{ padding: "10px 46px", fontSize: 44, background: can ? "var(--tape)" : "#8a8678", color: "#0b0b0c", border: "none", cursor: can ? "pointer" : "not-allowed", boxShadow: can ? "0 0 0 3px #0b0b0c, 0 0 0 6px var(--tape)" : "none", transform: "rotate(-1deg)" }}>
            STAMP IT
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
