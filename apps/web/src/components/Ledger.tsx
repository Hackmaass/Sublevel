"use client";

import { useState } from "react";
import { useGame } from "@/lib/game";
import { useChain } from "@/lib/chainGame";
import { addressUrl, txUrl } from "@/lib/monad";

const panel: React.CSSProperties = {
  position: "absolute",
  left: 28,
  width: 300,
  padding: "10px 14px",
  background: "linear-gradient(180deg, rgba(20,20,22,0.95), rgba(11,11,12,0.92))",
  border: "1px solid var(--tape)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  zIndex: 25,
};

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

/**
 * THE LEDGER: the book that IS the chain. Every transaction both wallets send — who, what, which block, how long it took to land —
 * with a link to the explorer. This is what makes Monad's speed something the room can see.
 */
export function Ledger() {
  const chain = useGame((s) => s.chain);
  const mismatch = useGame((s) => s.chainMismatch);
  const ledger = useChain((s) => s.ledger);
  const dep = useChain((s) => s.deployment);
  const boutId = useChain((s) => s.boutId);
  const [big, setBig] = useState(false);
  if (!chain) return null;

  const avg = ledger.length ? Math.round(ledger.reduce((a, t) => a + t.ms, 0) / ledger.length) : 0;
  const rows = big ? [...ledger].reverse() : ledger.slice(-5).reverse();

  return (
    <div style={{ ...panel, top: 420, ...(big ? { height: 560, overflow: "auto", width: 560, zIndex: 70 } : {}) }}>
      <div onClick={() => setBig((b) => !b)} style={{ cursor: "pointer" }} title="click to expand">
        <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.2em", color: "var(--tape)" }}>THE LEDGER · MONAD TESTNET</div>
        <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)", marginBottom: 4 }}>
          {ledger.length} txs · avg {avg} ms to land{mismatch > 0 ? <span style={{ color: "var(--blood)" }}> · ⚠ chain≠engine ×{mismatch}</span> : <span style={{ color: "var(--ok)" }}> · chain = engine ✓</span>}
        </div>
      </div>
      {rows.map((t) => (
        <a key={t.hash} href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="typewriter" style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 12, lineHeight: "20px", color: t.who === "you" ? "var(--paper)" : "var(--smear)", textDecoration: "none" }}>
          <span>
            <b style={{ color: t.who === "you" ? "var(--tape)" : "var(--smear)" }}>{t.who === "you" ? "YOU" : "HOUSE"}</b> {t.label}
          </span>
          <span>
            blk {String(t.block)} · {t.ms}ms {big ? `· ${short(t.hash)}` : ""}
          </span>
        </a>
      ))}
      {ledger.length === 0 && <div className="typewriter" style={{ fontSize: 12, color: "var(--smear)" }}>waiting for the first transaction…</div>}
      {big && dep && (
        <div className="typewriter" style={{ fontSize: 12, marginTop: 8, color: "var(--smear)" }}>
          bout #{boutId} · arena{" "}
          <a href={addressUrl(dep.arena)} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>
            {short(dep.arena)}
          </a>
        </div>
      )}
    </div>
  );
}
