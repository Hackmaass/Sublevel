"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useGame } from "@/lib/game";
import { useRoom } from "@/lib/room";
import { RELAY_ENABLED } from "@/lib/roomBridge";
import { useViewport } from "@/lib/viewport";

/** The address a phone should open: the page's own origin, or — when this screen was opened as `localhost` — this machine's network address. */
export function useJoinUrl(): { url: string | null; host: string | null } {
  const code = useRoom((s) => s.code);
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    if (!RELAY_ENABLED) return; // the hosted build has no relay, so there is nothing to point a phone at
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

function useQr(url: string | null): string | null {
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

/**
 * "Scan to join" for the projector: big while nobody has joined (readable across a room), gone once a phone is in.
 * Only shown while the relay answers — a QR for a server nobody can reach would be a lie.
 */
export function ScanToJoin() {
  const screen = useGame((s) => s.screen);
  const tutorial = useGame((s) => s.tutorial);
  const qrBig = useRoom((s) => s.qrBig);
  const relay = useRoom((s) => s.relay);
  const code = useRoom((s) => s.code);
  const on = useRoom((s) => s.on);
  const vp = useViewport();
  const { url, host } = useJoinUrl();
  const qr = useQr(url);
  const bigScreen = !!vp && !vp.compact && !vp.coarse;
  const show = bigScreen && on && qrBig && relay === "online" && !!qr && !tutorial && screen !== "lobby";
  const title = screen === "title";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="scan"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          style={{
            position: "absolute",
            zIndex: 45,
            ...(title ? { left: 36, bottom: 215, width: 230 } : { left: "50%", marginLeft: -150, top: 640, width: 300 }),
            padding: "10px 12px 10px",
            background: "linear-gradient(180deg, rgba(20,20,22,0.94), rgba(11,11,12,0.92))",
            border: "2px solid var(--tape)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.65)",
            textAlign: "center",
          }}
        >
          <div className="stencil" style={{ fontSize: title ? 14 : 18, letterSpacing: "0.22em", color: "var(--tape)" }}>
            SCAN TO READ THE FIGHT
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr!} alt="QR code to join the room" style={{ width: title ? 170 : 240, height: title ? 170 : 240, display: "block", margin: "8px auto 6px", imageRendering: "pixelated" }} />
          <div className="display" style={{ fontSize: title ? 34 : 48, lineHeight: 1, letterSpacing: "0.12em", color: "var(--paper)" }}>
            {code}
          </div>
          <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)", marginTop: 4 }}>
            or open {host}/watch and type the code
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
