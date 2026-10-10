"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, encodeDeployData, formatEther, formatGwei, type Address, type Hex } from "viem";
import { bootstrapAbi, bootstrapBytecode } from "@sublevel/chain";
import { EXPLORER, addressUrl, faucetUrl, injected, monadTestnet, publicClient, txUrl } from "@/lib/monad";

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

const mono: React.CSSProperties = { fontFamily: "var(--font-type)" };
const display: React.CSSProperties = { fontFamily: "var(--font-display)", textTransform: "uppercase" };

const errText = (e: unknown): string => {
  const x = e as { shortMessage?: string; message?: string };
  return x.shortMessage ?? x.message ?? String(e);
};

/**
 * One-transaction deploy of the whole system (Cards + Armory + Ladder + Arena, wired inside the constructor) from YOUR wallet.
 * No CLI, no key leaves the wallet: this page only asks it to sign one deployment transaction on Monad testnet.
 */
export default function Deploy() {
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [full, setFull] = useState(true);
  const [gas, setGas] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const refresh = useCallback(async (who: Address, fullEnabled: boolean) => {
    setError(null);
    try {
      const [bal, price] = await Promise.all([publicClient.getBalance({ address: who }), publicClient.getGasPrice()]);
      setBalance(bal);
      setGasPrice(price);
      const data = encodeDeployData({ abi: bootstrapAbi, bytecode: bootstrapBytecode, args: [fullEnabled] });
      const est = await publicClient.estimateGas({ account: who, data });
      setGas(est + est / 10n); // Monad charges the gas LIMIT: keep the buffer small
    } catch (e) {
      setGas(null);
      setError(`Could not estimate the deployment: ${errText(e)}`);
    }
  }, []);

  useEffect(() => {
    if (account) void refresh(account, full);
  }, [account, full, refresh]);

  const connect = async () => {
    setError(null);
    const p = injected();
    if (!p) return setError("No wallet found in this browser. Install MetaMask (or Rabby) and reload.");
    setBusy("Connecting…");
    try {
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(p) });
      const [addr] = await wc.requestAddresses();
      try {
        await wc.switchChain({ id: monadTestnet.id });
      } catch {
        await wc.addChain({ chain: monadTestnet });
        await wc.switchChain({ id: monadTestnet.id });
      }
      setAccount(addr!);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const deploy = async () => {
    const p = injected();
    if (!p || !account || !gas) return;
    setError(null);
    setBusy("Confirm the deployment in your wallet…");
    try {
      const wc = createWalletClient({ account, chain: monadTestnet, transport: custom(p) });
      const hash = await wc.deployContract({ abi: bootstrapAbi, bytecode: bootstrapBytecode, args: [full], gas });
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
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const cost = gas && gasPrice ? gas * gasPrice : null;
  const enough = balance !== null && cost !== null && balance > cost;
  const snippet = result
    ? `export const DEPLOYMENT: Deployment | null = ${JSON.stringify(result, null, 2)};`
    : "";

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", background: "radial-gradient(ellipse at 50% -10%, #3a2f1f, #0b0b0c 60%)", color: "var(--paper)", padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ ...display, fontSize: 64, lineHeight: 1 }}>DEPLOY</div>
        <div style={{ ...mono, fontSize: 15, color: "var(--smear)", marginTop: 6 }}>
          One transaction from your wallet puts the whole game on Monad testnet: Cards, Armory, Ladder and Arena, wired inside the constructor, with no admin key left over. Nothing here ever sees a private key.
        </div>

        {/* 1 connect */}
        <Step n={1} title="Connect your wallet" done={!!account}>
          {account ? (
            <div style={mono}>
              {account} · <span style={{ color: "var(--ok)" }}>{balance !== null ? `${Number(formatEther(balance)).toFixed(3)} MON` : "…"}</span>
            </div>
          ) : (
            <button onClick={connect} disabled={!!busy} style={btn()}>
              CONNECT METAMASK
            </button>
          )}
          <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 6 }}>
            Switches to Monad Testnet (chain 10143). Need test MON? <a href={faucetUrl} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>faucet.monad.xyz</a>
          </div>
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
            {balance !== null && cost !== null && !enough && <span style={{ color: "var(--blood)" }}> — not enough MON in this wallet</span>}
          </div>
          <div style={{ ...mono, fontSize: 12, color: "var(--smear)", marginTop: 6 }}>
            Monad rule: a wallet under 10 MON can send one transaction per ~3 blocks. If the wallet just sent something, wait a few seconds first.
          </div>
        </Step>

        {/* 3 deploy */}
        <Step n={3} title="Deploy" done={!!result}>
          <button onClick={deploy} disabled={!account || !gas || !enough || !!busy || !!result} style={btn(!account || !gas || !enough || !!busy || !!result)}>
            {result ? "DEPLOYED" : "DEPLOY TO MONAD TESTNET"}
          </button>
          {busy && <div style={{ ...mono, color: "var(--tape)", marginTop: 8 }}>● {busy}</div>}
          {txHash && (
            <div style={{ ...mono, fontSize: 13, marginTop: 8 }}>
              tx: <a href={txUrl(txHash)} target="_blank" rel="noreferrer" style={{ color: "var(--tape)" }}>{txHash}</a>
            </div>
          )}
        </Step>

        {error && <div style={{ ...mono, marginTop: 14, color: "var(--blood)", border: "1px solid var(--blood)", padding: 10 }}>{error}</div>}

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
            <button onClick={() => void navigator.clipboard?.writeText(snippet)} style={{ ...btn(), marginTop: 8, fontSize: 18 }}>
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
  return { ...display, fontSize: 26, padding: "10px 24px", border: "none", cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#2a2a2d" : "var(--tape)", color: disabled ? "#6b6b6e" : "#0b0b0c" };
}
