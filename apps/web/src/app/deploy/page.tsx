"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, encodeDeployData, formatEther, formatGwei, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bootstrapAbi, bootstrapBytecode } from "@sublevel/chain";
import { EXPLORER, addressUrl, faucetUrl, makeTransport, monadTestnet, publicClient, txUrl } from "@/lib/monad";
import { discoverWallets, ensureMonadTestnet, rememberWallet, rememberedWallet, walletError, type WalletInfo } from "@/lib/wallets";
import { getGuestKey } from "@/lib/chainGame";

interface Result {
  chainId: 10143;
  bootstrap: Address;
  cards: Address;
  armory: Address;
  arena: Address;
  ladder: Address;
  fullEnabled: boolean;
  deployTx: Hex;
  deployBlock: number;
}

type Signer = { kind: "wallet"; wallet: WalletInfo; address: Address } | { kind: "guest"; address: Address };

const mono: React.CSSProperties = { fontFamily: "var(--font-type)" };
const display: React.CSSProperties = { fontFamily: "var(--font-display)", textTransform: "uppercase" };

/**
 * One-transaction deploy of the whole system (Cards + Armory + Ladder + Arena, wired inside the constructor).
 * Sign with ANY wallet extension (each wallet is discovered separately, so having several installed doesn't break it) — or with the
 * browser's guest wallet, no extension at all. The contracts have no admin, so it doesn't matter which account deploys.
 * No private key ever leaves the wallet; the guest key lives only in this browser.
 */
export default function Deploy() {
  const [wallets, setWallets] = useState<WalletInfo[] | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [full, setFull] = useState(true);
  const [gas, setGas] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    void discoverWallets().then(setWallets);
  }, []);

  const refresh = useCallback(async (who: Address, fullEnabled: boolean) => {
    try {
      const [bal, price] = await Promise.all([publicClient.getBalance({ address: who }), publicClient.getGasPrice()]);
      setBalance(bal);
      setGasPrice(price);
      const data = encodeDeployData({ abi: bootstrapAbi, bytecode: bootstrapBytecode, args: [fullEnabled] });
      const est = await publicClient.estimateGas({ account: who, data });
      setGas(est + est / 10n); // Monad charges the gas LIMIT: keep the buffer small
      setError(null);
    } catch (e) {
      setGas(null);
      setError(`Could not estimate the deployment: ${(e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    if (!signer) return;
    void refresh(signer.address, full);
    // the guest wallet is funded from a faucet: keep its balance fresh
    if (signer.kind !== "guest") return;
    const id = setInterval(() => void refresh(signer.address, full), 4000);
    return () => clearInterval(id);
  }, [signer, full, refresh]);

  const connect = async (w: WalletInfo) => {
    setError(null);
    setBusy(`Connecting ${w.name}…`);
    try {
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(w.provider) });
      const [addr] = await wc.requestAddresses();
      await ensureMonadTestnet(w);
      rememberWallet(w.id);
      setSigner({ kind: "wallet", wallet: w, address: addr! });
    } catch (e) {
      setError(walletError(e, w));
    } finally {
      setBusy(null);
    }
  };

  const useGuest = () => {
    setError(null);
    setSigner({ kind: "guest", address: privateKeyToAccount(getGuestKey()).address });
  };

  const deploy = async () => {
    if (!signer || !gas) return;
    setError(null);
    setBusy(signer.kind === "guest" ? "Sending the deployment…" : "Confirm the deployment in your wallet…");
    try {
      const wc =
        signer.kind === "guest"
          ? createWalletClient({ account: privateKeyToAccount(getGuestKey()), chain: monadTestnet, transport: makeTransport() })
          : createWalletClient({ account: signer.address, chain: monadTestnet, transport: custom(signer.wallet.provider) });
      const hash = await wc.deployContract({ abi: bootstrapAbi, bytecode: bootstrapBytecode, args: [full], gas } as never);
      setTxHash(hash);
      setBusy("Deployment sent — waiting for it to land on Monad…");
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success" || !rc.contractAddress) throw new Error("The deployment transaction reverted.");
      const bootstrap = rc.contractAddress;
      const read = (fn: "cards" | "armory" | "arena" | "ladder") => publicClient.readContract({ address: bootstrap, abi: bootstrapAbi, functionName: fn }) as Promise<Address>;
      const [cards, armory, arena, ladder] = await Promise.all([read("cards"), read("armory"), read("arena"), read("ladder")]);
      const r: Result = { chainId: 10143, bootstrap, cards, armory, arena, ladder, fullEnabled: full, deployTx: hash, deployBlock: Number(rc.blockNumber) };
      setResult(r);
      try {
        localStorage.setItem("sublevel.deployment", JSON.stringify(r));
      } catch {
        /* storage may be unavailable */
      }
    } catch (e) {
      setError(walletError(e, signer.kind === "wallet" ? signer.wallet : null));
    } finally {
      setBusy(null);
    }
  };

  const cost = gas && gasPrice ? gas * gasPrice : null;
  const enough = balance !== null && cost !== null && balance > cost;
  const snippet = result ? `export const DEPLOYMENT: Deployment | null = ${JSON.stringify(result, null, 2)};` : "";
  const remembered = rememberedWallet();
  const hasPhantom = (wallets ?? []).some((w) => /phantom/i.test(w.name));

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", background: "radial-gradient(ellipse at 50% -10%, #3a2f1f, #0b0b0c 60%)", color: "var(--paper)", padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ ...display, fontSize: 64, lineHeight: 1 }}>DEPLOY</div>
        <div style={{ ...mono, fontSize: 15, color: "var(--smear)", marginTop: 6 }}>
          One transaction puts the whole game on Monad testnet: Cards, Armory, Ladder and Arena, wired inside the constructor, with no admin key left over. Nothing here ever sees a private key from your wallet.
        </div>

        {/* 1 sign with */}
        <Step n={1} title="Choose how to sign" done={!!signer}>
          {signer ? (
            <div style={mono}>
              {signer.kind === "guest" ? "guest wallet" : signer.wallet.name} · {signer.address} ·{" "}
              <span style={{ color: "var(--ok)" }}>{balance !== null ? `${Number(formatEther(balance)).toFixed(3)} MON` : "…"}</span>
              {!result && !busy && (
                <button onClick={() => { setSigner(null); setBalance(null); setGas(null); }} style={{ ...mono, marginLeft: 10, background: "none", border: "none", color: "var(--smear)", textDecoration: "underline", cursor: "pointer" }}>
                  change
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {wallets === null && <span style={mono}>Looking for wallets…</span>}
                {(wallets ?? []).map((w) => (
                  <button key={w.id} onClick={() => void connect(w)} disabled={!!busy} style={btn(!!busy)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {w.icon && <img src={w.icon} alt="" width={26} height={26} style={{ verticalAlign: "middle", marginRight: 8, borderRadius: 5 }} />}
                    {w.name}
                    {remembered === w.id ? " ✓" : ""}
                  </button>
                ))}
                <button onClick={useGuest} disabled={!!busy} style={{ ...btn(!!busy), background: "transparent", color: "var(--paper)", border: "2px solid rgba(245,241,230,0.5)" }}>
                  USE A GUEST WALLET (NO EXTENSION)
                </button>
              </div>
              {wallets !== null && wallets.length === 0 && <div style={{ ...mono, fontSize: 13, color: "var(--smear)", marginTop: 8 }}>No wallet extension detected in this browser. Use the guest wallet, or install MetaMask / Rabby and reload.</div>}
              {hasPhantom && (
                <div style={{ ...mono, fontSize: 12, color: "var(--tape)", marginTop: 8, lineHeight: 1.4 }}>
                  Heads-up: Phantom&apos;s own docs list no Monad network, so it may refuse Monad Testnet. If it does, pick another wallet above or use the guest wallet.
                </div>
              )}
              <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 8, lineHeight: 1.45 }}>
                Each wallet is listed on its own, so having several installed (MetaMask + Phantom…) is fine. The <b>guest wallet</b> is a throw-away key kept in this browser: fund it from the{" "}
                <a href={faucetUrl} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>faucet</a>, then deploy. The contracts have no admin, so whoever deploys gains no power.
              </div>
            </>
          )}
          {signer?.kind === "guest" && (
            <div style={{ ...mono, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              Send testnet MON to the address above (about 3 MON), e.g. paste it into the{" "}
              <a href={faucetUrl} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>faucet</a>. This page refreshes the balance by itself.
            </div>
          )}
        </Step>

        {/* 2 review */}
        <Step n={2} title="Review the cost" done={!!result}>
          <label style={{ ...mono, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} disabled={!!busy || !!result} />
            Enable the Full format (3v3, hidden hands)
          </label>
          <div style={{ ...mono, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            gas limit: <b>{gas ? gas.toString() : "—"}</b> · gas price: <b>{gasPrice ? `${formatGwei(gasPrice)} gwei` : "—"}</b>
            <br />
            You pay the gas <b>limit</b> on Monad: <b style={{ color: "var(--tape)" }}>{cost ? `${Number(formatEther(cost)).toFixed(3)} MON` : "—"}</b>
            {balance !== null && cost !== null && !enough && <span style={{ color: "var(--blood)" }}> — not enough MON in this account yet</span>}
          </div>
          <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 6 }}>
            Monad rule: an account under 10 MON can send one transaction per ~3 blocks. If it just sent something (or was just funded), wait a few seconds.
          </div>
        </Step>

        {/* 3 deploy */}
        <Step n={3} title="Deploy" done={!!result}>
          <button onClick={deploy} disabled={!signer || !gas || !enough || !!busy || !!result} style={btn(!signer || !gas || !enough || !!busy || !!result)}>
            {result ? "DEPLOYED" : "DEPLOY TO MONAD TESTNET"}
          </button>
          {busy && <div style={{ ...mono, color: "var(--tape)", marginTop: 8 }}>● {busy}</div>}
          {txHash && (
            <div style={{ ...mono, fontSize: 13, marginTop: 8 }}>
              tx: <a href={txUrl(txHash)} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>{txHash}</a>
            </div>
          )}
        </Step>

        {error && <div style={{ ...mono, marginTop: 14, color: "var(--blood)", border: "1px solid var(--blood)", padding: 10, lineHeight: 1.45 }}>{error}</div>}

        {/* 4 result */}
        {result && (
          <Step n={4} title="Deployed" done>
            {(["bootstrap", "cards", "armory", "arena", "ladder"] as const).map((k) => (
              <div key={k} style={{ ...mono, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px dashed rgba(245,241,230,0.2)" }}>
                <span style={{ color: "var(--smear)", width: 90 }}>{k}</span>
                <a href={addressUrl(result[k])} target="_blank" rel="noreferrer" style={{ color: "var(--paper)", wordBreak: "break-all" }}>
                  {result[k]}
                </a>
              </div>
            ))}
            <div style={{ ...mono, fontSize: 13, marginTop: 10, color: "var(--smear)" }}>
              block {result.deployBlock} · explorer {EXPLORER.replace("https://", "")}
            </div>
            <textarea readOnly value={snippet} rows={14} style={{ ...mono, width: "100%", marginTop: 10, fontSize: 12, background: "#17140f", color: "var(--paper)", border: "1px solid rgba(245,241,230,0.25)", padding: 8 }} />
            <button onClick={() => void navigator.clipboard?.writeText(snippet)} style={{ ...btn(false), marginTop: 8, fontSize: 18 }}>
              COPY
            </button>
            <div style={{ ...mono, fontSize: 13, marginTop: 10 }}>Send the <b>bootstrap</b> address (or the tx hash) back to the developer: everything else is read from chain.</div>
          </Step>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22, padding: "14px 16px", background: "rgba(20,20,22,0.9)", border: `1px solid ${done ? "var(--ok)" : "rgba(245,241,230,0.16)"}` }}>
      <div style={{ ...display, fontSize: 26, marginBottom: 8 }}>
        {n}. {title} {done ? <span style={{ color: "var(--ok)" }}>✓</span> : null}
      </div>
      {children}
    </div>
  );
}

function btn(disabled = false): React.CSSProperties {
  return { ...display, fontSize: 22, padding: "10px 20px", border: "none", cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#2a2a2d" : "var(--tape)", color: disabled ? "#6b6b6e" : "#0b0b0c" };
}
