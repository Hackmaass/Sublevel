/**
 * Where SUBLEVEL lives on Monad testnet. Filled in by the /deploy page's output after the one-transaction Bootstrap deploy.
 * `null` until deployed — the on-chain features stay hidden rather than pointing at a made-up address.
 */
export interface Deployment {
  chainId: 10143;
  bootstrap: `0x${string}`;
  cards: `0x${string}`;
  armory: `0x${string}`;
  arena: `0x${string}`;
  ladder: `0x${string}`;
  fullEnabled: boolean;
  deployTx: `0x${string}`;
  deployBlock: number;
}

export const DEPLOYMENT: Deployment | null = null;
