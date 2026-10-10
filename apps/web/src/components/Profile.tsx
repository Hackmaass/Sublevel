"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { privateKeyToAccount } from "viem/accounts";
import { short, useAccount } from "@/lib/account";
import { FORMATS, useBelt, vacantBelt, type BeltView, type Standing } from "@/lib/belt";
import { getDeployment, getGuestKey } from "@/lib/chainGame";
import { addressUrl } from "@/lib/monad";
import { unlockAudio, sfx } from "@/lib/sfx";
import { discoverWallets, type WalletInfo } from "@/lib/wallets";

const mono: React.CSSProperties = { fontFamily: "var(--font-type)" };
const btn = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 22, padding: "8px 18px", background: bg, color: fg, border: "none", cursor: "pointer" });
const ghost: React.CSSProperties = { ...btn("rgba(11,11,12,0.7)", "var(--paper)"), border: "2px solid rgba(245,241,230,0.4)", fontSize: 22, padding: "6px 16px" };
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** top-left of the title screen: who you are (wallet) and the way to the Belt. The on-chain duel button owns the top-right. */
export function ProfileChip({ deployed }: { deployed: boolean }) {
  const account = useAccount((s) => s.account);
  const openLogin = useAccount((s) => s.openLogin);
  const signOut = useAccount((s) => s.signOut);
  const showBelt = useBelt((s) => s.show);
  return (
    <div style={{ position: "absolute", left: 36, top: 30, zIndex: 30, display: "flex", gap: 14, alignItems: "center" }}>
      {account ? (
        <div style={{ ...mono, display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "rgba(11,11,12,0.78)", border: "2px solid rgba(245,241,230,0.4)", color: "var(--paper)", fontSize: 18 }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#4ade80", boxShadow: "0 0 10px #4ade80" }} />
          <a href={addressUrl(account.address)} target="_blank" rel="noreferrer" style={{ color: "var(--paper)" }}>{short(account.address)}</a>
          <span style={{ color: "var(--smear)", fontSize: 14 }}>{account.wallet}</span>
          <button onClick={signOut} style={{ ...mono, background: "none", border: "none", color: "var(--smear)", textDecoration: "underline", fontSize: 13, cursor: "pointer" }}>
            sign out
          </button>
        </div>
      ) : (
        <button onClick={() => { unlockAudio(); sfx.bell(); openLogin(); }} className="display" style={ghost}>
          SIGN IN WITH WALLET
        </button>
      )}
      {deployed && (
        <button onClick={() => { unlockAudio(); sfx.bell(); showBelt(); }} className="display" style={ghost}>
          🏆 THE BELT
        </button>
      )}
    </div>
  );
}

/** picks a wallet, asks it to sign one gasless message, remembers the address in this browser */
export function LoginModal() {
  const open = useAccount((s) => s.loginOpen);
  const busy = useAccount((s) => s.busy);
  const error = useAccount((s) => s.error);
  const close = useAccount((s) => s.closeLogin);
  const signIn = useAccount((s) => s.signIn);
  const [wallets, setWallets] = useState<WalletInfo[] | null>(null);
  useEffect(() => {
    if (open) {
      setWallets(null);
      void discoverWallets().then(setWallets);
    }
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.86)", display: "grid", placeItems: "center" }}>
          <div className="paper" style={{ width: 760, padding: "30px 40px 28px", boxShadow: "0 30px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="display" style={{ fontSize: 56, color: "#0b0b0c", lineHeight: 1 }}>SIGN IN</div>
              <button onClick={close} disabled={busy} className="display" style={{ fontSize: 24, padding: "2px 16px", background: "#0b0b0c", color: "var(--paper)", border: "none", cursor: "pointer" }}>
                CLOSE
              </button>
            </div>
            <div style={{ ...mono, fontSize: 16, color: "#2b2b2d", marginTop: 8, lineHeight: 1.4 }}>
              Pick a wallet and sign one short message. <b>No transaction, no gas, no network switch.</b> Your address is remembered in this browser only — there is no account on a server.
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              {wallets === null && <div style={{ ...mono, color: "#555" }}>Looking for wallets in this browser…</div>}
              {wallets?.map((w) => (
                <button key={w.id} onClick={() => void signIn(w)} disabled={busy} className="display" style={{ ...btn("var(--tape)", "#0b0b0c"), fontSize: 30, display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
                  {w.icon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.icon} alt="" width={30} height={30} />}
                  {busy ? "CHECK YOUR WALLET…" : `SIGN IN WITH ${w.name.toUpperCase()}`}
                </button>
              ))}
              {wallets?.length === 0 && (
                <div style={{ ...mono, fontSize: 15, color: "var(--blood)", border: "1px dashed var(--blood)", padding: 12, lineHeight: 1.4 }}>
                  No wallet extension found in this browser. Install MetaMask, Rabby or OKX and reload — or just keep playing: the on-chain duel needs no wallet at all (a guest key signs for you).
                </div>
              )}
            </div>
            {error && <div style={{ ...mono, marginTop: 12, color: "var(--blood)", border: "1px solid var(--blood)", padding: 10, fontSize: 14 }}>{error}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** the two Belts, read straight from the Ladder contract */
export function BeltRoom() {
  const { open, loading, error, belts, standing, ladder, guest } = {
    open: useBelt((s) => s.open),
    loading: useBelt((s) => s.loading),
    error: useBelt((s) => s.error),
    belts: useBelt((s) => s.belts),
    standing: useBelt((s) => s.standing),
    ladder: useBelt((s) => s.ladder),
    guest: useBelt((s) => s.guest),
  };
  const hide = useBelt((s) => s.hide);
  const load = useBelt((s) => s.load);
  const account = useAccount((s) => s.account);
  const fallbackGuest = open && !guest && getDeployment() ? privateKeyToAccount(getGuestKey()).address : guest;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 125, background: "rgba(0,0,0,0.88)", display: "grid", placeItems: "center" }}>
          <div className="paper" style={{ width: 1500, maxHeight: 1020, overflow: "auto", padding: "26px 44px 26px", boxShadow: "0 30px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="display" style={{ fontSize: 66, color: "#0b0b0c", lineHeight: 1 }}>THE BELT</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => void load()} disabled={loading} className="display" style={{ ...btn("transparent", "#0b0b0c"), border: "2px solid #0b0b0c", fontSize: 22 }}>
                  {loading ? "READING…" : "REFRESH"}
                </button>
                <button onClick={hide} className="display" style={{ fontSize: 24, padding: "2px 16px", background: "#0b0b0c", color: "var(--paper)", border: "none", cursor: "pointer" }}>
                  CLOSE
                </button>
              </div>
            </div>
            <div style={{ ...mono, fontSize: 16, color: "#2b2b2d", marginTop: 6, lineHeight: 1.4 }}>
              One belt per format, an NFT (ERC-721) minted by the Ladder contract. It <b>changes hands only when the holder loses a ranked bout</b>, and only to the fighter who beat them.
              It is <b>soulbound to the reign</b>: nobody can sell it, send it, or have it handed over by a database. The artwork below is drawn by the contract itself.
            </div>

            {error && <div style={{ ...mono, marginTop: 12, color: "var(--blood)", border: "1px solid var(--blood)", padding: 10, fontSize: 14 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 18 }}>
              {FORMATS.map((f) => (
                <BeltCard key={f.id} name={f.name} blurb={f.blurb} belt={belts.find((b) => b.format === f.id) ?? null} loading={loading} you={[fallbackGuest, account?.address]} standing={standing?.[f.id]} />
              ))}
            </div>

            <div style={{ ...mono, marginTop: 18, fontSize: 14, color: "#2b2b2d", lineHeight: 1.5, borderTop: "2px dashed rgba(0,0,0,0.35)", paddingTop: 12 }}>
              <div>
                <b>You fight as</b> the guest key{" "}
                {fallbackGuest ? <a href={addressUrl(fallbackGuest)} target="_blank" rel="noreferrer" style={{ color: "#0b0b0c" }}>{short(fallbackGuest)}</a> : "…"}
                {account ? <> · signed in as <b>{short(account.address)}</b> ({account.wallet}). Belts and ratings accrue to the key that fights, which today is the guest key.</> : <> · sign in with a wallet from the title screen to put a name to it.</>}
              </div>
              <div style={{ marginTop: 4 }}>
                <b>Honest status:</b> the Ladder is deployed on Monad testnet
                {ladder && <> (<a href={addressUrl(ladder)} target="_blank" rel="noreferrer" style={{ color: "#0b0b0c" }}>{short(ladder)}</a>)</>}, but this build has no ranked queue yet, and the on-chain duel is an unranked bout against the house bot — so it can&apos;t move a belt. Both belts stay vacant until two real fighters meet in a ranked bout.
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BeltCard({ name, blurb, belt, loading, you, standing }: { name: string; blurb: string; belt: BeltView | null; loading: boolean; you: (string | null | undefined)[]; standing?: Standing }) {
  const held = !!belt?.holder;
  const mine = held && you.some((y) => same(y, belt!.holder));
  const format = name === "FULL" ? 1 : 0;
  const img = belt?.image ?? vacantBelt(format);
  return (
    <div style={{ background: "rgba(0,0,0,0.07)", border: "1px dashed rgba(0,0,0,0.4)", padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="display" style={{ fontSize: 40, color: "#0b0b0c", lineHeight: 1 }}>
          {name} <span style={{ ...mono, fontSize: 15, color: "#555" }}>{blurb}</span>
        </div>
        <div className="stencil" style={{ fontSize: 15, letterSpacing: "0.2em", color: held ? "#1c6b1c" : "var(--blood)" }}>{loading && !belt ? "READING…" : held ? "HELD" : "VACANT"}</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={`${name} belt`} style={{ width: "100%", marginTop: 10, boxShadow: "0 8px 22px rgba(0,0,0,0.45)", opacity: held ? 1 : 0.62, filter: held ? "none" : "grayscale(0.5)" }} />
      <div style={{ ...mono, fontSize: 15, color: "#0b0b0c", marginTop: 10, lineHeight: 1.45 }}>
        {held ? (
          <>
            Holder <a href={addressUrl(belt!.holder!)} target="_blank" rel="noreferrer" style={{ color: "#0b0b0c" }}>{short(belt!.holder!)}</a> · {belt!.defenses} defence{belt!.defenses === 1 ? "" : "s"} · reign #{belt!.reigns} · since {new Date(belt!.since * 1000).toLocaleDateString()}
            {mine && <span className="display" style={{ marginLeft: 10, fontSize: 20, background: "var(--tape)", padding: "1px 10px" }}>YOU HOLD THIS BELT</span>}
          </>
        ) : (
          <>Nobody holds it. The first decisive ranked bout in this format crowns its winner. <b>NOT MINTED.</b></>
        )}
      </div>
      <div style={{ ...mono, fontSize: 14, color: "#555", marginTop: 6 }}>
        Your guest key: {!standing ? "…" : standing.bouts === 0 ? "UNRATED (no ranked bouts yet)" : `${standing.rating} Elo · ${standing.wins}W ${standing.losses}L ${standing.draws}D`}
      </div>
    </div>
  );
}
