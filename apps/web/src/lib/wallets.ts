"use client";

import type { Eip1193 } from "./monad";

/**
 * Wallet discovery that survives having several wallet extensions installed.
 *
 * `window.ethereum` is a single slot that every extension fights over; with MetaMask + Phantom (or others) installed it can be a
 * "which wallet?" chooser proxy that fails with errors like `evmAsk.js … selectExtension … Unexpected error`. EIP-6963 fixes this:
 * every wallet ANNOUNCES its own provider, so we can list them and use the one the user picks.
 */
export interface WalletInfo {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193;
}

interface Announce {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193;
}

type LegacyProvider = Eip1193 & { isMetaMask?: boolean; isPhantom?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean; isOkxWallet?: boolean; isBackpack?: boolean; providers?: LegacyProvider[] };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const legacyName = (p: LegacyProvider): string =>
  p.isRabby ? "Rabby" : p.isPhantom ? "Phantom" : p.isBackpack ? "Backpack" : p.isOkxWallet ? "OKX Wallet" : p.isCoinbaseWallet ? "Coinbase Wallet" : p.isMetaMask ? "MetaMask" : "Browser wallet";

/** every wallet in this browser, each with its OWN provider (never the shared `window.ethereum` proxy when avoidable) */
export async function discoverWallets(): Promise<WalletInfo[]> {
  if (typeof window === "undefined") return [];
  const found: WalletInfo[] = [];
  const add = (w: WalletInfo) => {
    if (found.some((f) => f.provider === w.provider || f.id === w.id)) return;
    found.push(w);
  };

  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<Announce>).detail;
    if (d?.info && d.provider) add({ id: d.info.rdns ?? d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider });
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await sleep(400); // wallets announce asynchronously
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  // wallets that predate or skip EIP-6963
  const w = window as unknown as { phantom?: { ethereum?: LegacyProvider }; ethereum?: LegacyProvider };
  if (w.phantom?.ethereum) add({ id: "phantom", name: "Phantom", provider: w.phantom.ethereum });
  const eth = w.ethereum;
  if (eth) {
    const list = eth.providers?.length ? eth.providers : [eth];
    // only trust the shared slot when no wallet announced itself: it may be a chooser proxy that throws when used
    if (found.length === 0 || eth.providers?.length) for (const p of list) add({ id: `legacy:${legacyName(p)}`, name: legacyName(p), provider: p });
  }
  return found;
}

/** the wallet the user chose last time, if it is still installed */
export const rememberedWallet = (): string | null => {
  try {
    return localStorage.getItem("sublevel.wallet");
  } catch {
    return null;
  }
};
export const rememberWallet = (id: string) => {
  try {
    localStorage.setItem("sublevel.wallet", id);
  } catch {
    /* storage may be unavailable */
  }
};

/** turn a wallet's raw error into something a person can act on */
export function walletError(e: unknown, w?: WalletInfo | null): string {
  const x = e as { code?: number; shortMessage?: string; message?: string };
  const m = x?.shortMessage ?? x?.message ?? String(e);
  if (x?.code === 4001 || /user (rejected|denied)/i.test(m)) return "You declined the request in the wallet.";
  if (/selectExtension|evmAsk|Unexpected error/i.test(m)) return "Your browser has several wallet extensions fighting over the same slot. Pick a wallet from the list above (not the generic one), or disable the other wallet extensions for this site.";
  if (/4902|Unrecognized chain|not.*(support|added)|Chain.*not/i.test(m) && w?.name === "Phantom") return "Phantom doesn't support Monad Testnet (its docs list no Monad). Use MetaMask, Rabby or OKX for this step, or deploy with the guest wallet.";
  if (/4902|Unrecognized chain/i.test(m)) return "The wallet doesn't know Monad Testnet. Add it in the wallet's network settings: RPC https://testnet-rpc.monad.xyz, chain id 10143, symbol MON.";
  return m;
}

export const MONAD_CHAIN_HEX = "0x279f"; // 10143

/** make sure the wallet is on Monad Testnet (switch, else add, else explain) */
export async function ensureMonadTestnet(w: WalletInfo): Promise<void> {
  const chainId = async () => String(await w.provider.request({ method: "eth_chainId" })).toLowerCase();
  if ((await chainId()) === MONAD_CHAIN_HEX) return;
  try {
    await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_CHAIN_HEX }] });
  } catch (e) {
    try {
      await w.provider.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: MONAD_CHAIN_HEX, chainName: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: ["https://testnet-rpc.monad.xyz"], blockExplorerUrls: ["https://testnet.monadvision.com"] }],
      });
      await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_CHAIN_HEX }] }).catch(() => {});
    } catch {
      throw e;
    }
  }
  if ((await chainId()) !== MONAD_CHAIN_HEX) throw new Error(`${w.name} is not on Monad Testnet (chain 10143). Switch the network in the wallet, then try again.`);
}
