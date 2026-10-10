import { createPublicClient, defineChain, http } from "viem";

/** Monad testnet (chain 10143). Facts verified in docs/TECH_ARCHITECTURE.md §1. */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monadscan", url: "https://testnet.monadscan.com" } },
});

export const EXPLORER = "https://testnet.monadscan.com";
export const faucetUrl = "https://faucet.monad.xyz";
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;

/** `?rpc=http://127.0.0.1:8545` points READS at a local node for testing — localhost only, so a crafted link can't redirect them elsewhere */
const localRpc = (() => {
  if (typeof window === "undefined") return undefined;
  const v = new URLSearchParams(window.location.search).get("rpc");
  return v && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/.test(v) ? v : undefined;
})();

export const rpcUrl = localRpc;
/** true when reads are pointed at a local node (`?rpc=`): the UI must not call that "Monad testnet" */
export const isLocalChain = !!localRpc;
export const chainLabel = isLocalChain ? "LOCAL TEST CHAIN" : "MONAD TESTNET";
/** Monad's blocks are ~0.4 s: poll for receipts far faster than viem's 4 s default */
export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(localRpc), pollingInterval: 200 });

/** the minimal EIP-1193 surface we use from an injected wallet (MetaMask, Rabby, …) */
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

// NOTE: there is deliberately no `window.ethereum` helper here. With several wallet extensions installed that slot can be a chooser proxy
// that throws (`evmAsk … selectExtension`). Wallets are discovered per-wallet via EIP-6963 in ./wallets.ts.
