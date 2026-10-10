/**
 * The guest-wallet duel, end to end on a local anvil: deploy with the GENERATED Bootstrap creation code (the same bytes the /deploy page
 * sends), two guest wallets (you + the house bot), claim cards, open + accept a challenge, play a whole Lite bout where the human seat
 * is driven by this test and the house by `houseLoop`, and check every transaction landed in the ledger.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LITE, legalActions, mulberry32 } from "@sublevel/engine";
import { Actor, bootstrapAbi, bootstrapBytecode, houseLoop, playLead, playTurn, readRevealedAction, startDuel, type TxLog } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const anvilBin = existsSync(resolve(root, "tools/foundry/anvil.exe")) ? resolve(root, "tools/foundry/anvil.exe") : "anvil";
const PORT = 8551;
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [`http://127.0.0.1:${PORT}`] } } });
const transport = http(`http://127.0.0.1:${PORT}`);
const pub = createPublicClient({ chain, transport, pollingInterval: 50 });
const test = createTestClient({ chain, transport, mode: "anvil" });

let proc: ChildProcess;
let addrs: { arena: Address; armory: Address; cards: Address };

beforeAll(async () => {
  proc = spawn(anvilBin, ["--port", String(PORT), "--silent", "--code-size-limit", "262144"], { stdio: "ignore" });
  for (let i = 0; i < 80; i++) {
    try {
      await pub.getChainId();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  const deployer = privateKeyToAccount(generatePrivateKey());
  await test.setBalance({ address: deployer.address, value: 10n ** 21n });
  const w = createWalletClient({ account: deployer, chain, transport });
  const hash = await w.deployContract({ abi: bootstrapAbi, bytecode: bootstrapBytecode, args: [true], gas: 29_000_000n });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const b = rc.contractAddress!;
  const read = (fn: "cards" | "armory" | "arena") => pub.readContract({ address: b, abi: bootstrapAbi, functionName: fn }) as Promise<Address>;
  addrs = { cards: await read("cards"), armory: await read("armory"), arena: await read("arena") };
}, 90000);

afterAll(() => {
  proc?.kill();
});

describe("guest-wallet duel", () => {
  it("plays a full Lite bout through the contracts, house bot vs a scripted human seat", async () => {
    const ledger: TxLog[] = [];
    const mk = async (who: "you" | "house") => {
      const acct = privateKeyToAccount(generatePrivateKey());
      await test.setBalance({ address: acct.address, value: 10n ** 20n });
      const a = new Actor(who, pub, createWalletClient({ account: acct, chain, transport }), addrs, (t) => ledger.push(t));
      a.spacing = { ms: 0 }; // anvil only mines on demand: no spacing needed
      return a;
    };
    const [you, house] = [await mk("you"), await mk("house")];
    const steps: string[] = [];
    const duel = await startDuel({ you, house, youPresets: { a: 0, b: 3, trick: 0 }, housePresets: { a: 6, b: 4, trick: 3 }, step: (s) => steps.push(s) });
    expect(steps.length).toBeGreaterThanOrEqual(5);
    let stop = false;
    const houseRun = houseLoop({ seat: duel.house, side: 1, actor: house, stop: () => stop });

    await playLead(duel.you, 0);
    const rng = mulberry32(99);
    let turns = 0;
    let meta = await duel.you.meta();
    while (meta.phase === "TurnCommit" && turns < 12) {
      const view = (await duel.you.view())!;
      const legal = legalActions(view.state, 0);
      const a = legal[Math.floor(rng() * legal.length)]!;
      meta = await playTurn(duel.you, view.state.turn, a);
      turns++;
      const theirs = await readRevealedAction(pub, addrs.arena, duel.boutId, 1);
      expect(theirs).not.toBeNull(); // the house's move is public once revealed
      if (meta.phase === "ReplaceCommit") break; // Lite sudden death is out of scope for this test
    }
    stop = true;
    await houseRun;
    expect(["Over", "ReplaceCommit"]).toContain(meta.phase);
    const view = (await duel.you.view())!;
    expect(view.state.format.id).toBe(LITE.id);
    // every game transaction both wallets sent is in the ledger, with a block and a measured latency
    expect(ledger.some((t) => t.who === "you" && t.label === "seal move")).toBe(true);
    expect(ledger.some((t) => t.who === "house" && t.label === "reveal move")).toBe(true);
    expect(ledger.every((t) => t.block > 0n && t.ms >= 0)).toBe(true);
  }, 180000);
});
