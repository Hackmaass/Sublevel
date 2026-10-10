/**
 * END-TO-END against a local anvil node: the TypeScript client plays real bouts through the real contracts and the stored state must equal
 * the TypeScript engine's. Proves, across languages and libraries:
 *   • every commitment (commit / slot / full-lead hashes) equals what Solidity computes
 *   • secrets derived from ONE wallet signature are enough to play (and to resume) a whole bout
 *   • Lite and Full (hidden hands, openings, OpenCards pauses) work from a TS client
 * Needs `forge build` (contracts/out) and the project-local anvil (tools/foundry/anvil.exe, or `anvil` on PATH).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { applyReplacements, chooseReplacement, createBout, encodeState, legalActions, mulberry32, packHex, resolveTurn, type BoutState, type FighterBuild, type Loadout } from "@sublevel/engine";
import { FULL, LITE } from "@sublevel/engine";
import { armoryAbi, arenaAbi, cardsAbi, ladderAbi, commitHash, deriveSecrets, fullLeadHash, secretMessage, Seat, slotHash, TAG } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = resolve(root, "contracts/out");
const anvilBin = existsSync(resolve(root, "tools/foundry/anvil.exe")) ? resolve(root, "tools/foundry/anvil.exe") : "anvil";
const PORT = 8546;
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [`http://127.0.0.1:${PORT}`] } } });
const transport = http(`http://127.0.0.1:${PORT}`);
const pub = createPublicClient({ chain, transport });
const test = createTestClient({ chain, transport, mode: "anvil" });

const bytecode = (name: string): Hex => `0x${JSON.parse(readFileSync(resolve(out, `${name}.sol/${name}.json`), "utf8")).bytecode.object.replace(/^0x/, "")}`;

let proc: ChildProcess;
let cards: Address, armory: Address, arena: Address, ladder: Address;

const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const deployer = privateKeyToAccount(generatePrivateKey());
const wallet = (account: typeof alice) => createWalletClient({ account, chain, transport });

async function waitFor(ms: number) {
  const t0 = Date.now();
  for (;;) {
    try {
      await pub.getChainId();
      return;
    } catch {
      if (Date.now() - t0 > ms) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

async function deploy(name: string, abi: readonly unknown[], args: unknown[]): Promise<Address> {
  const hash = await wallet(deployer).deployContract({ abi, bytecode: bytecode(name), args } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  return r.contractAddress!;
}

async function call(account: typeof alice, address: Address, abi: readonly unknown[], functionName: string, args: unknown[]): Promise<unknown> {
  const { request, result } = await pub.simulateContract({ account, address, abi, functionName, args } as never);
  const hash = await wallet(account).writeContract(request as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  expect(r.status).toBe("success");
  return result;
}

beforeAll(async () => {
  proc = spawn(anvilBin, ["--port", String(PORT), "--silent", "--code-size-limit", "131072"], { stdio: "ignore" });
  await waitFor(15000);
  for (const a of [alice, bob, deployer]) await test.setBalance({ address: a.address, value: 10n ** 21n });
  cards = await deploy("Cards", cardsAbi, []);
  armory = await deploy("Armory", armoryAbi, [cards]);
  ladder = await deploy("Ladder", ladderAbi, []);
  arena = await deploy("Arena", arenaAbi, [cards, armory, ladder, true]);
  await call(deployer, cards, cardsAbi, "wire", [armory, arena]);
  await call(deployer, armory, armoryAbi, "wire", [arena]);
  await call(deployer, ladder, ladderAbi, "wire", [arena]);
}, 60000);

afterAll(() => {
  proc?.kill();
});

/* ---------------- a pool of cards for one player ---------------- */
interface CardDef {
  kind: "F" | "K";
  build?: FighterBuild;
  trick?: number;
}
const f = (style: 0 | 1 | 2, a: number, b: number, spread: number): CardDef => ({ kind: "F", build: { style, attackIds: [a, b], spread } });
const k = (trick: number): CardDef => ({ kind: "K", trick });
// legal builds taken from the vector set
const LITE_POOL: CardDef[] = [f(1, 11, 10, 0), f(2, 12, 16, 2), k(3)];
const FULL_POOL_A: CardDef[] = [f(1, 11, 10, 0), f(2, 12, 16, 2), f(1, 7, 9, 2), f(2, 13, 16, 0), f(1, 8, 9, 2), k(3), k(5), k(1)];
const FULL_POOL_B: CardDef[] = [f(0, 0, 2, 2), f(0, 1, 5, 2), f(1, 11, 9, 0), f(1, 8, 9, 2), f(2, 12, 16, 2), k(4), k(1), k(2)];

async function mintPool(account: typeof alice, defs: CardDef[], format: 0 | 1): Promise<{ pool: bigint; ids: bigint[] }> {
  const ids: bigint[] = [];
  for (const [i, d] of defs.entries()) {
    await test.increaseTime({ seconds: 6 }); // mint cooldown
    await test.mine({ blocks: 1 });
    if (d.kind === "F") ids.push((await call(account, cards, cardsAbi, "mintFighter", [d.build!.style, d.build!.attackIds[0], d.build!.attackIds[1], d.build!.spread, `0x${"00".repeat(32)}`, "", `Card ${i}`])) as bigint);
    else ids.push((await call(account, cards, cardsAbi, "mintTrick", [d.trick!, `0x${"00".repeat(32)}`, "", `Trick ${i}`])) as bigint);
  }
  const pool = (await call(account, armory, armoryAbi, "register", [format, ids])) as bigint;
  return { pool, ids };
}

const shuffle = <T,>(a: T[], r: () => number): T[] => [...a].sort(() => r() - 0.5);

describe("TypeScript client ↔ contracts (anvil)", () => {
  it("every commitment equals what Solidity computes", async () => {
    const hh = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
    const a = { chainId: 31337n, arena, boutId: 7n, turn: 3, tag: 1, player: alice.address, choice: 5, salt: hh(99) };
    expect(commitHash(a)).toBe(await pub.readContract({ address: arena, abi: arenaAbi, functionName: "commitHashOf", args: [7n, 3, 1, alice.address, 5, hh(99)] }));
    const s = { chainId: 31337n, arena, boutId: 7n, side: 1, slot: 3, cardId: 42n, salt: hh(5) };
    expect(slotHash(s)).toBe(await pub.readContract({ address: arena, abi: arenaAbi, functionName: "slotHashOf", args: [7n, 1, 3, 42n, hh(5)] }));
    const hs = [1, 2, 3, 4, 5].map(hh) as [Hex, Hex, Hex, Hex, Hex];
    const l = { chainId: 31337n, arena, boutId: 7n, player: bob.address, lead: 2, slotHashes: hs, salt: hh(8) };
    expect(fullLeadHash(l)).toBe(await pub.readContract({ address: arena, abi: arenaAbi, functionName: "fullLeadHashOf", args: [7n, bob.address, 2, hs, hh(8)] }));
  });

  it("secrets are recoverable: the same signature always derives the same salts, different bouts differ", async () => {
    const msg = (b: bigint, s: 0 | 1) => secretMessage(31337n, arena, b, s);
    const sig1 = await alice.signMessage({ message: msg(1n, 0) });
    const sig2 = await alice.signMessage({ message: msg(1n, 0) });
    expect(sig1).toBe(sig2); // deterministic signatures (RFC 6979) → recoverable on any device
    const a = deriveSecrets(sig1);
    const b = deriveSecrets(sig2);
    expect(a.leadSalt).toBe(b.leadSalt);
    expect(a.slotSalt(2)).toBe(b.slotSalt(2));
    expect(a.slotSalt(1)).not.toBe(a.slotSalt(2));
    expect(a.phaseSalt(1, 4)).not.toBe(a.phaseSalt(2, 4));
    const other = deriveSecrets(await alice.signMessage({ message: msg(2n, 0) }));
    expect(other.leadSalt).not.toBe(a.leadSalt);
  });

  async function playBout(format: 0 | 1, seed: number, resumeMidway: boolean): Promise<void> {
    const rng = mulberry32(seed);
    const defsA = format === 0 ? LITE_POOL : FULL_POOL_A;
    const defsB = format === 0 ? LITE_POOL : FULL_POOL_B;
    const A = await mintPool(alice, defsA, format);
    const B = await mintPool(bob, defsB, format);
    const boutId = (await call(alice, arena, arenaAbi, "createChallenge", [format, A.pool])) as bigint;
    await call(bob, arena, arenaAbi, "acceptChallenge", [boutId, B.pool]);

    // the hand: Lite = the whole pool; Full = a secret 3 fighters + 2 tricks in a secret order
    const pick = (defs: CardDef[], ids: bigint[]) => {
      if (format === 0) return { idx: [0, 1, 2], ids: undefined as bigint[] | undefined };
      const fi = shuffle(defs.map((d, i) => (d.kind === "F" ? i : -1)).filter((i) => i >= 0), rng).slice(0, 3);
      const ki = shuffle(defs.map((d, i) => (d.kind === "K" ? i : -1)).filter((i) => i >= 0), rng).slice(0, 2);
      const idx = [...fi, ...ki];
      return { idx, ids: idx.map((i) => ids[i]!) };
    };
    const pa = pick(defsA, A.ids);
    const pb = pick(defsB, B.ids);
    const loadout = (defs: CardDef[], idx: number[], lead: number): Loadout => ({
      fighters: format === 0 ? defs.filter((d) => d.kind === "F").map((d) => d.build!) : idx.slice(0, 3).map((i) => defs[i]!.build!),
      tricks: format === 0 ? defs.filter((d) => d.kind === "K").map((d) => d.trick!) : idx.slice(3).map((i) => defs[i]!.trick!),
      lead,
    });
    const nLead = format === 0 ? 2 : 3;
    const leads: [number, number] = [Math.floor(rng() * nLead), Math.floor(rng() * nLead)];
    let mirror: BoutState = createBout(format === 0 ? LITE : FULL, loadout(defsA, pa.idx, leads[0]), loadout(defsB, pb.idx, leads[1]));

    // each seat derives all its secrets from ONE signature
    const mk = async (acc: typeof alice, side: 0 | 1, ids?: bigint[]) =>
      new Seat({ publicClient: pub, walletClient: wallet(acc), arena, boutId, side, hand: ids, secrets: deriveSecrets(await acc.signMessage({ message: secretMessage(31337n, arena, boutId, side) })) });
    let sa = await mk(alice, 0, pa.ids);
    let sb = await mk(bob, 1, pb.ids);

    await sa.commitLead(format, leads[0]);
    await sb.commitLead(format, leads[1]);
    await sa.revealLead(format, leads[0]);
    await sb.revealLead(format, leads[1]);

    let resumed = false;
    for (let i = 0; i < 80; i++) {
      const m = await sa.meta();
      if (m.phase === "Over") break;
      if (resumeMidway && !resumed && i === 3) {
        // "page refresh": throw the seats away and rebuild them from fresh signatures only
        sa = await mk(alice, 0, pa.ids);
        sb = await mk(bob, 1, pb.ids);
        resumed = true;
      }
      const v = (await sa.view())!;
      if (m.phase === "TurnCommit") {
        const a = chooseAction(mirror, 0, rng);
        const b = chooseAction(mirror, 1, rng);
        await sa.commit(TAG.ACTION, v.state.turn, a);
        await sb.commit(TAG.ACTION, v.state.turn, b);
        await sa.reveal(TAG.ACTION, v.state.turn, a);
        await sb.reveal(TAG.ACTION, v.state.turn, b);
        mirror = resolveTurn(mirror, a, b).state;
      } else if (m.phase === "ReplaceCommit") {
        const ch: [number, number] = [m.mustAct[0] ? chooseReplacement(mirror, 0, rng) : 0, m.mustAct[1] ? chooseReplacement(mirror, 1, rng) : 0];
        if (m.mustAct[0]) await sa.commit(TAG.REPLACE, v.state.turn, ch[0]);
        if (m.mustAct[1]) await sb.commit(TAG.REPLACE, v.state.turn, ch[1]);
        if (m.mustAct[0]) await sa.reveal(TAG.REPLACE, v.state.turn, ch[0]);
        if (m.mustAct[1]) await sb.reveal(TAG.REPLACE, v.state.turn, ch[1]);
        mirror = applyReplacements(mirror, ch).state;
      } else if (m.phase === "OpenCards") {
        if (m.mustAct[0]) await sa.openRequired();
        if (m.mustAct[1]) await sb.openRequired();
      } else {
        throw new Error(`unexpected phase ${m.phase}`);
      }
    }
    const end = await sa.meta();
    expect(end.phase).toBe("Over");
    if (format === 1) {
      await sa.openRest();
      await sb.openRest();
    }
    if (resumeMidway) expect(resumed).toBe(true);
    const chainState = await pub.readContract({ address: arena, abi: arenaAbi, functionName: "getState", args: [boutId] });
    expect(chainState).toBe(packHex(encodeState(mirror)));
    expect(end.winner).toBe(mirror.result!.winner);
  }

  const chooseAction = (st: BoutState, side: 0 | 1, r: () => number): number => {
    const l = legalActions(st, side);
    return l[Math.floor(r() * l.length)]!;
  };

  it("plays Lite bouts through the contracts and matches the engine", async () => {
    for (const seed of [1, 2, 3]) await playBout(0, seed, false);
  }, 120000);

  it("plays Full bouts (hidden hands, openings, pauses) and matches the engine", async () => {
    for (const seed of [11, 12, 13, 14]) await playBout(1, seed, false);
  }, 240000);

  it("a Full bout survives a 'page refresh': seats rebuilt from the wallet signature alone", async () => {
    await playBout(1, 21, true);
  }, 120000);
});
