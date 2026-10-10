"use client";

import { useEffect, useState } from "react";
import { CLASS_NAMES, STYLE_NAMES, type PredClass, type Prediction } from "@sublevel/engine";
import { useRemoteRoom } from "@/lib/roomBridge";

const STYLE_COLOR = ["#ff5a1f", "#f5f1e6", "#7a5cff"];

/** The spectator's phone: read the next move of each fighter before it happens. Picks are sealed until the turn after. */
export default function Watch() {
  const { snap, id, name, setName, pick, picked, rejected, code, connected } = useRemoteRoom();
  const [typed, setTyped] = useState("");
  const [choice, setChoice] = useState<(PredClass | null)[]>([null, null]);
  const turn = snap?.turn ?? -1;
  // a new window clears the local picks
  useEffect(() => setChoice([null, null]), [turn]);

  const live = !!snap?.live;
  const locked = picked === turn;
  const canLock = live && snap!.open && !locked && choice[0] !== null && choice[1] !== null;
  const me = snap?.humans.find((h) => h.id === id);
  const rank = me?.rank ?? 0;
  const myLast = snap && id in snap.results ? snap.results[id] : null;

  const mono: React.CSSProperties = { fontFamily: "var(--font-type)" };
  const display: React.CSSProperties = { fontFamily: "var(--font-display)", textTransform: "uppercase" };

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", background: "radial-gradient(ellipse at 50% -10%, #3a2f1f, #0b0b0c 60%)", color: "var(--paper)", padding: "18px 16px 40px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ ...display, fontSize: 44, lineHeight: 1 }}>THE ROOM</div>
        <div style={{ ...mono, fontSize: 13, color: "var(--smear)" }}>read the next move. nothing you pick touches the fight.</div>

        <label style={{ ...mono, display: "block", fontSize: 11, color: "var(--smear)", marginTop: 14 }}>
          YOUR NAME
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 18))}
            style={{ ...mono, display: "block", width: "100%", marginTop: 3, padding: "8px 10px", fontSize: 16, background: "#17140f", color: "var(--paper)", border: "1px solid rgba(245,241,230,0.25)" }}
          />
        </label>

        {code === null && !snap && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.length >= 4) window.location.search = `?room=${typed}`;
            }}
            style={{ marginTop: 24 }}
          >
            <label style={{ ...mono, fontSize: 11, color: "var(--smear)" }}>
              ROOM CODE — it's on the big screen
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                placeholder="K7QX"
                autoCapitalize="characters"
                style={{ ...display, display: "block", width: "100%", marginTop: 3, padding: "10px", fontSize: 34, letterSpacing: "0.2em", textAlign: "center", background: "#17140f", color: "var(--paper)", border: "1px solid rgba(245,241,230,0.25)" }}
              />
            </label>
            <button type="submit" disabled={typed.length < 4} style={{ ...display, width: "100%", marginTop: 10, fontSize: 26, padding: "12px 0", border: "none", cursor: "pointer", background: typed.length >= 4 ? "var(--tape)" : "#2a2a2d", color: typed.length >= 4 ? "#0b0b0c" : "#6b6b6e" }}>
              JOIN THE ROOM
            </button>
            <p style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 12 }}>Same browser as the game? Just open it in another window — no code needed.</p>
          </form>
        )}
        {code && !snap && (
          <p style={{ ...mono, fontSize: 15, marginTop: 24, color: "var(--smear)" }}>
            {connected ? `Room ${code}: waiting for the big screen…` : `Connecting to room ${code}… make sure you're on the same network as the big screen.`}
          </p>
        )}
        {snap && !live && (
          <p style={{ ...mono, fontSize: 15, marginTop: 24, color: "var(--smear)" }}>No fight on the big screen right now. Hang tight.</p>
        )}

        {live && snap && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
              <div style={{ ...display, fontSize: 24 }}>TURN {turn + 1}{code ? <span style={{ ...mono, fontSize: 12, color: "var(--smear)", marginLeft: 8 }}>room {code}</span> : null}</div>
              <div style={{ ...mono, fontSize: 13, color: snap.open ? "var(--tape)" : "var(--smear)" }}>
                {snap.open ? `● open · ${snap.locked}/${snap.total} locked` : "○ shut — watch the table"}
              </div>
            </div>

            {snap.fighters.map((f, side) => (
              <div key={side} style={{ marginTop: 14, padding: "12px 12px 14px", background: "rgba(20,20,22,0.9)", border: "1px solid rgba(245,241,230,0.14)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ ...display, fontSize: 26 }}>{f.name}</div>
                  <div style={{ ...mono, fontSize: 12, color: STYLE_COLOR[f.style] }}>
                    {STYLE_NAMES[f.style]} · HP {Math.max(0, f.hp)}/{f.maxHp}
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 12, color: "var(--smear)", margin: "2px 0 8px" }}>what does {f.name} do next?</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                  {CLASS_NAMES.map((label, c) => {
                    const sel = choice[side] === c;
                    return (
                      <button
                        key={label}
                        disabled={locked || !snap.open}
                        onClick={() => setChoice((p) => p.map((v, i) => (i === side ? (sel ? null : (c as PredClass)) : v)) as (PredClass | null)[])}
                        style={{
                          ...display,
                          fontSize: 13,
                          letterSpacing: "0.02em",
                          padding: "12px 0",
                          minHeight: 48,
                          cursor: "pointer",
                          background: sel ? "var(--tape)" : "transparent",
                          color: sel ? "#0b0b0c" : "var(--paper)",
                          border: `2px solid ${sel ? "var(--tape)" : "rgba(245,241,230,0.3)"}`,
                          opacity: locked || !snap.open ? 0.5 : 1,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              disabled={!canLock}
              onClick={() => pick(turn, choice as Prediction)}
              style={{ ...display, width: "100%", marginTop: 16, fontSize: 30, padding: "14px 0", minHeight: 56, border: "none", cursor: canLock ? "pointer" : "not-allowed", background: canLock ? "var(--tape)" : "#2a2a2d", color: canLock ? "#0b0b0c" : "#6b6b6e" }}
            >
              {locked ? "SEALED" : "LOCK IT IN"}
            </button>
            {locked && <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 6 }}>Sealed. The room's read is revealed — and scored — next turn.</div>}
            {rejected && !locked && <div style={{ ...mono, fontSize: 12, color: "var(--blood)", marginTop: 6 }}>Not counted ({rejected}). Try again next turn.</div>}
            {!locked && !snap.open && <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 6 }}>Next window opens when the fighters start choosing.</div>}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, ...mono }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--smear)" }}>YOUR POINTS</div>
                <div style={{ ...display, fontSize: 40 }}>{me?.points ?? 0}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--smear)" }}>RANK</div>
                <div style={{ ...display, fontSize: 40 }}>{rank > 0 ? `#${rank}` : "—"}</div>
              </div>
            </div>
            {myLast !== null && snap.last && (
              <div style={{ ...mono, fontSize: 14, marginTop: 4, color: myLast > 0 ? "var(--ok)" : "var(--smear)" }}>
                Turn {snap.last.turn + 1}: you read {myLast} of 2 — they played {CLASS_NAMES[snap.last.actual[0]]} / {CLASS_NAMES[snap.last.actual[1]]}.
              </div>
            )}

            <div style={{ ...mono, marginTop: 22 }}>
              <div style={{ fontSize: 11, color: "var(--smear)", marginBottom: 4 }}>BEST READERS</div>
              {snap.board.slice(0, 5).map((b, i) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "3px 0", color: b.id === id ? "var(--tape)" : "var(--paper)" }}>
                  <span>
                    {i + 1}. {b.name}
                    {!b.human && <span style={{ color: "var(--smear)", fontSize: 11 }}> · house</span>}
                  </span>
                  <span>{b.points}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
