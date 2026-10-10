/**
 * Where SUBLEVEL lives on Monad testnet (output of the /deploy page's one-transaction Bootstrap deploy, block 69,789,792).
 * Set to `null` to hide the on-chain features rather than point them at an address that doesn't exist.
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

export const DEPLOYMENT: Deployment | null = {
  chainId: 10143,
  bootstrap: "0x45fcce56c139b28655a3b7083f98e41c6c36e04d",
  cards: "0xb04f5d938e92563FC48aC9acF7fc367527BC9dcD",
  armory: "0xff8425F545Cf2EB51B0604F227ba842d52109453",
  arena: "0x4e8a6874dC1c607721191f93B76156c30355294b",
  ladder: "0x327b300ac0EFaF463a5363Fd3f4d9F5b55525788",
  fullEnabled: true,
  deployTx: "0x0f12d1dbfa0f2c0a47bbaecdc5ad07cdccfe6f147376da80cc1c1326363d7873",
  deployBlock: 69789792,
};
