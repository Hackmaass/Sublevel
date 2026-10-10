"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useGame } from "@/lib/game";
import { useRoom } from "@/lib/room";
import { P2P_ENABLED, RELAY_ENABLED } from "@/lib/roomBridge";
import { useViewport } from "@/lib/viewport";

/** The address a phone should open: the page's own origin, or — when this screen was opened as `localhost` — this machine's network address. */
export function useJoinUrl(): { url: string | null; host: string | null } {
  const code = useRoom((s) => s.code);
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    if (!RELAY_ENABLED && !P2P_ENABLED) return; // neither a relay nor a peer link: nothing to point a phone at
    let alive = true;
    const { hostname, origin, port } = window.location;
    const forced = new URLSearchParams(window.location.search).get("lan"); // ?lan=192.168.1.20 when the automatic guess is the wrong adapter
    if (forced && /^[\d.]{7,15}$/.test(forced)) {
      setBase(`http://${forced}:${port || "3000"}`);
      return;
    }
    if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
      setBase(origin);
      return;
    }
    fetch("/api/lan")
      .then((r) => r.json() as Promise<{ port: string; addresses: string[] }>)
      .then((j) => alive && setBase(j.addresses[0] ? `http://${j.addresses[0]}:${j.port || port || "3000"}` : null))
      .catch(() => alive && setBase(null));
    return () => {
      alive = false;
    };
  }, []);
  return { url: base && code ? `${base}/watch?room=${code}` : null, host: base ? base.replace(/^https?:\/\//, "") : null };
}

export function useQr(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return setSrc(null);
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#0b0b0c", light: "#f5f1e6" } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return src;
}

/** how long the big, background-dimmed QR stays up the first time a match starts */
const INTRO_MS = 12_000;

/**
 * "Scan to join" for the projector.
 *  • title screen: a small card in the corner (nothing there to get in the way);
 *  • in a match: the first time, a big QR centred over a DIMMED screen for ~12 s (click / Esc closes it early), then it tucks away. The QR chip in
 *    the room panel (RoomView) and the bottom-bar "qr" button bring it back.
 * Only shown while the relay answers — a QR for a server nobody can reach would be a lie — and it closes itself once a phone has joined.
 */
export function ScanToJoin() {
  const screen = useGame((s) => s.screen);
  const tutorial = useGame((s) => s.tutorial);
  const qrBig = useRoom((s) => s.qrBig);
  const relay = useRoom((s) => s.relay);
  const code = useRoom((s) => s.code);
  const on = useRoom((s) => s.on);
  const phones = useRoom((s) => s.spectators.some((x) => x.human));
  const vp = useViewport();
  const { url, host } = useJoinUrl();
  const qr = useQr(url);
  const [auto, setAuto] = useState(false);
  const bigScreen = !!vp && !vp.compact && !vp.coarse;
  const ready = bigScreen && on && relay === "online" && !!qr && !tutorial && screen !== "lobby";
  const title = screen === "title";

  // the intro: once per browser session, the first time a match is on screen with the relay up and nobody has joined yet
  useEffect(() => {
    if (!ready || title || phones) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem("sublevel.qr.intro") === "1";
      if (!seen) sessionStorage.setItem("sublevel.qr.intro", "1");
    } catch {
      /* storage blocked: fall through and show it once per page load */
    }
    if (seen) return;
    useRoom.setState({ qrBig: true });
    setAuto(true);
    const id = setTimeout(() => {
      useRoom.setState({ qrBig: false });
      setAuto(false);
    }, INTRO_MS);
    return () => clearTimeout(id);
  }, [ready, title, phones]);

  const close = () => {
    useRoom.setState({ qrBig: false });
    setAuto(false);
  };

  useEffect(() => {
    if (!qrBig) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrBig]);

  const small = title;
  const card = (
    <>
      <div className="stencil" style={{ fontSize: small ? 14 : 22, letterSpacing: "0.22em", color: "var(--tape)" }}>
        SCAN TO READ THE FIGHT
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr ?? ""} alt="QR code to join the room" style={{ width: small ? 170 : 330, height: small ? 170 : 330, display: "block", margin: "10px auto 8px", imageRendering: "pixelated" }} />
      <div className="display" style={{ fontSize: small ? 34 : 64, lineHeight: 1, letterSpacing: "0.12em", color: "var(--paper)" }}>
        {code}
      </div>
      <div className="typewriter" style={{ fontSize: small ? 12 : 15, color: "var(--smear)", marginTop: 6 }}>
        or open {host}/watch and type the code
      </div>
    </>
  );

  return (
    <>
      {/* title screen: a small corner card */}
      <AnimatePresence>
        {ready && title && !phones && (
          <motion.div
            key="title-scan"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ position: "absolute", zIndex: 45, left: 36, bottom: 215, width: 230, padding: "10px 12px", background: "linear-gradient(180deg, rgba(20,20,22,0.94), rgba(11,11,12,0.92))", border: "2px solid var(--tape)", boxShadow: "0 10px 40px rgba(0,0,0,0.65)", textAlign: "center" }}
          >
            {card}
          </motion.div>
        )}
      </AnimatePresence>

      {/* in a match: big over a dimmed screen, then it tucks away */}
      <AnimatePresence>
        {ready && !title && qrBig && (
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.78)", display: "grid", placeItems: "center", cursor: "pointer" }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.3, x: 640, y: -60, opacity: 0 }} // shrinks off toward the QR chip in the room panel
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              style={{ width: 460, padding: "18px 22px 16px", background: "linear-gradient(180deg, rgba(20,20,22,0.98), rgba(11,11,12,0.97))", border: "3px solid var(--tape)", boxShadow: "0 30px 90px rgba(0,0,0,0.85)", textAlign: "center" }}
            >
              {card}
              <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)", marginTop: 12 }}>
                {auto ? "this tucks itself away in a moment" : "click anywhere or press Esc to close"} · find it again in the QR chip on the right, or the “qr” button
              </div>
              {auto && (
                <div style={{ height: 4, background: "rgba(245,241,230,0.15)", marginTop: 8 }}>
                  <motion.div initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: INTRO_MS / 1000, ease: "linear" }} style={{ height: "100%", background: "var(--tape)" }} />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
