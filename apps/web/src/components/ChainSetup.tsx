"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { formatEther } from "viem";
import { GUEST_NEEDS, useChain } from "@/lib/chainGame";
import { addressUrl, faucetUrl } from "@/lib/monad";
import { discoverWallets, type WalletInfo } from "@/lib/wallets";

const mono: React.CSSProperties = { fontFamily: "var(--font-type)" };

/** The on-chain duel's front door: fund the guest wallet once, then everything else is automatic. */
export function ChainSetup() {
  const open = useChain((s) => s.setupOpen);
  const guest = useChain((s) => s.guest);
  const balance = useChain((s) => s.balance);
  const running = useChain((s) => s.running);
  const steps = useChain((s) => s.steps);
  const error = useChain((s) => s.error);
  const ledger = useChain((s) => s.ledger);
  const deployment = useChain((s) => s.deployment);
  const { start, close, refresh, fund, reset } = {
    start: useChain((s) => s.start),
    close: useChain((s) => s.closeSetup),
    refresh: useChain((s) => s.refresh),
    fund: useChain((s) => s.fundFromWallet),
    reset: useChain((s) => s.resetGuest),
  };

  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  useEffect(() => {
    if (open) void discoverWallets().then(setWallets);
  }, [open]);

  useEffect(() => {
    if (!open || running) return; // no balance polling while a duel is being set up: every request counts against the shared RPC limit
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [open, running, refresh]);

  const enough = balance !== null && balance >= GUEST_NEEDS;
  const mon = (v: bigint | null) => (v === null ? "…" : `${Number(formatEther(v)).toFixed(2)} MON`);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.86)", display: "grid", placeItems: "center" }}>
          <div className="paper" style={{ width: 920, maxHeight: 960, overflow: "auto", padding: "30px 40px 28px", boxShadow: "0 30px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="display" style={{ fontSize: 60, color: "#0b0b0c", lineHeight: 1 }}>ON-CHAIN DUEL</div>
              <button onClick={close} disabled={running} className="display" style={{ fontSize: 24, padding: "2px 16px", background: "#0b0b0c", color: "var(--paper)", border: "none", cursor: running ? "not-allowed" : "pointer" }}>
                CLOSE
              </button>
            </div>
            <div style={{ ...mono, fontSize: 16, color: "#2b2b2d", marginTop: 6, lineHeight: 1.4 }}>
              Every move you make is a <b>real transaction on Monad testnet</b>: sealed first, revealed after the house has sealed too, resolved by the contract. Your <b>guest wallet</b> signs for you (no popups), so nobody needs a wallet of their own to play.
            </div>

            {!deployment ? (
              <div style={{ ...mono, marginTop: 20, color: "var(--blood)" }}>The contracts are not deployed on this machine yet. Open <b>/deploy</b> first.</div>
            ) : (
              <>
                <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(0,0,0,0.07)", border: "1px dashed rgba(0,0,0,0.4)" }}>
                  <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.2em", color: "#555" }}>YOUR GUEST WALLET</div>
                  <div style={{ ...mono, fontSize: 15, color: "#0b0b0c", wordBreak: "break-all" }}>
                    {guest ? <a href={addressUrl(guest)} target="_blank" rel="noreferrer" style={{ color: "#0b0b0c" }}>{guest}</a> : "…"}
                  </div>
                  <div style={{ ...mono, fontSize: 22, marginTop: 4, color: enough ? "#1c6b1c" : "var(--blood)" }}>
                    {mon(balance)} <span style={{ fontSize: 13, color: "#555" }}>(needs about {formatEther(GUEST_NEEDS)} MON for the house bot's float and the bout's gas)</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    {wallets.map((w) => (
                      <button key={w.id} onClick={() => void fund(w, "3")} disabled={running} className="display" style={btn("var(--tape)", "#0b0b0c")}>
                        SEND 3 MON FROM {w.name.toUpperCase()}
                      </button>
                    ))}
                    <a href={faucetUrl} target="_blank" rel="noreferrer" className="display" style={{ ...btn("transparent", "#0b0b0c"), border: "2px solid #0b0b0c", textDecoration: "none" }}>
                      OPEN THE FAUCET
                    </a>
                    <button onClick={() => void refresh()} className="display" style={{ ...btn("transparent", "#0b0b0c"), border: "2px solid #0b0b0c" }}>
                      REFRESH
                    </button>
                  </div>
                  <div style={{ ...mono, fontSize: 12, color: "#555", marginTop: 8 }}>
                    Throw-away key, kept only in this browser, holding only testnet MON. Nothing here ever asks for your real wallet's key.
                  </div>
                </div>

                <button onClick={() => void start()} disabled={!enough || running} className="display" style={{ ...btn(enough && !running ? "var(--tape)" : "#2a2a2d", enough && !running ? "#0b0b0c" : "#6b6b6e"), fontSize: 36, marginTop: 18, width: "100%" }}>
                  {running ? "SETTING UP THE FIGHT…" : "START THE DUEL"}
                </button>

                {(steps.length > 0 || running) && (
                  <div style={{ ...mono, marginTop: 14, fontSize: 15, color: "#0b0b0c" }}>
                    {steps.map((s, i) => (
                      <div key={i}>✓ {s}</div>
                    ))}
                    {running && <div style={{ color: "var(--tape-dim)" }}>● {ledger.length} transactions so far…</div>}
                  </div>
                )}
                {error && <div style={{ ...mono, marginTop: 12, color: "var(--blood)", border: "1px solid var(--blood)", padding: 10, fontSize: 14 }}>{error}</div>}
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => window.confirm("Forget this guest wallet and its keys? Any MON left in it is lost.") && reset()} disabled={running} style={{ ...mono, background: "none", border: "none", color: "#555", textDecoration: "underline", fontSize: 12, cursor: "pointer" }}>
                    forget this guest wallet
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return { fontSize: 22, padding: "8px 18px", background: bg, color: fg, border: "none", cursor: "pointer" };
}
