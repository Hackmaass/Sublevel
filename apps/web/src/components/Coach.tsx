"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useGame } from "@/lib/game";
import { LESSONS } from "@/lib/tutorial";
import { sfx } from "@/lib/sfx";
import { Stamp, Tape } from "./ui/Marks";

/** The trainer: a taped-up note that talks you through the scripted first fight. Never a modal — the table stays live behind it. */
export function Coach() {
  const tutorial = useGame((s) => s.tutorial);
  const stage = useGame((s) => s.stage);
  const nudge = useGame((s) => s.nudge);
  const next = useGame((s) => s.tutorialContinue);
  const leave = useGame((s) => s.leaveTutorial);

  const shake = useAnimationControls();
  useEffect(() => {
    if (nudge > 0) void shake.start({ x: [0, -9, 9, -6, 6, 0], transition: { duration: 0.35 } });
  }, [nudge, shake]);

  const debrief = !!tutorial?.debrief;
  useEffect(() => {
    if (!debrief) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sfx.tick();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debrief, next]);

  if (!tutorial || stage === "over") return null;
  const lesson = LESSONS[tutorial.lesson];
  if (!lesson) return null;
  const waiting = stage !== "choose" && !debrief; // the turn is playing out: let the table speak

  return (
    <div style={{ position: "absolute", left: 28, top: 0, width: 470, zIndex: 40, pointerEvents: "none" }}>
      <motion.div animate={shake} style={{ position: "absolute", left: 0, top: 300, width: 470 }}>
      <AnimatePresence mode="wait">
        {!waiting && (
          <motion.div
            key={`${tutorial.lesson}-${debrief ? "after" : "before"}`}
            initial={{ opacity: 0, y: 24, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: -1.2 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="paper"
            style={{ position: "relative", padding: "26px 28px 20px", boxShadow: "0 22px 46px rgba(0,0,0,0.7)", pointerEvents: "auto", clipPath: "polygon(0 1%, 3% 0, 97% 1%, 100% 3%, 99% 98%, 96% 100%, 3% 99%, 0.5% 96%)" }}
          >
            <Tape w={110} h={28} rotate={-5} style={{ left: 30, top: -12 }} />
            <Tape w={110} h={28} rotate={6} style={{ right: 30, top: -12 }} />
            <div className="stencil" style={{ fontSize: 15, letterSpacing: "0.26em", color: "#555" }}>
              LESSON {tutorial.lesson + 1} OF {LESSONS.length} · {lesson.title}
            </div>
            <div className="typewriter" style={{ fontSize: 19, lineHeight: 1.38, color: "#141416", marginTop: 10 }}>
              {debrief ? lesson.after : lesson.before}
            </div>
            {nudge > 0 && !debrief && (
              <div className="marker" style={{ fontSize: 17, color: "var(--blood)", marginTop: 10, transform: "rotate(-1deg)" }}>
                not that one — pick the glowing move ▼
              </div>
            )}
            {debrief && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 14 }}>
                <Stamp color="var(--blood)" size={15} rotate={-3}>
                  {lesson.rule}
                </Stamp>
                <button
                  onClick={() => {
                    sfx.tick();
                    next();
                  }}
                  className="display"
                  style={{ fontSize: 28, padding: "4px 20px", background: "var(--tape)", color: "#0b0b0c", border: "none", cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 0 0 3px #0b0b0c, 0 0 0 5px var(--tape)" }}
                >
                  GOT IT ▸
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
      <div style={{ position: "absolute", left: 0, top: 192, pointerEvents: "auto" }}>
        <button
          onClick={() => leave("lobby")}
          className="typewriter"
          style={{ background: "rgba(0,0,0,0.55)", color: "var(--smear)", border: "1px solid rgba(245,241,230,0.18)", fontSize: 12, padding: "3px 10px", cursor: "pointer" }}
        >
          skip the lesson
        </button>
      </div>
    </div>
  );
}

/** Shown instead of the normal result screen once the scripted KO lands. */
export function TutorialResult() {
  const leave = useGame((s) => s.leaveTutorial);
  const again = useGame((s) => s.startTutorial);
  useEffect(() => {
    const id = setTimeout(() => sfx.stamp(), 500);
    return () => clearTimeout(id);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, zIndex: 80, background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.8), rgba(0,0,0,0.97))", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", width: 1000 }}>
        <motion.div initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.3 }} style={{ whiteSpace: "nowrap" }}>
          <Stamp color="var(--tape)" size={80} filled>
            FIRST BLOOD
          </Stamp>
        </motion.div>
        <div className="typewriter" style={{ fontSize: 22, marginTop: 60, color: "var(--paper)" }}>
          Knockout. In a Lite bout, the first KO wins. You've got the whole game now:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 22 }}>
          {LESSONS.map((l, i) => (
            <motion.div key={l.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.12 }}>
              <Stamp color="var(--paper)" size={17} rotate={(i % 3) - 1}>
                {l.rule}
              </Stamp>
            </motion.div>
          ))}
        </div>
        <div className="typewriter" style={{ fontSize: 15, marginTop: 20, color: "var(--smear)" }}>
          Real opponents don't play a script. They read you, and you read them. Mix it up — predictable players lose.
        </div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 38 }}>
          <button onClick={() => leave("fight")} className="display" style={btn("var(--tape)", "#0b0b0c")}>
            FIRST REAL FIGHT
          </button>
          <button onClick={() => leave("lobby")} className="display" style={btn("var(--paper)", "#0b0b0c")}>
            THE LOCKER
          </button>
          <button onClick={again} className="display" style={btn("transparent", "var(--paper)", true)}>
            AGAIN
          </button>
        </div>
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
