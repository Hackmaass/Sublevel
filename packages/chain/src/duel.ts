import { type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { PRESETS, eqBot, mulberry32, legalReplacements, type BoutState, type Rng } from "@sublevel/engine";
import { armoryAbi, arenaAbi, cardsAbi } from "./abi.generated";
import { Seat, TAG, type BoutMeta } from "./seat";

/**
 * Guest-wallet duels. A guest wallet is a key generated in the browser and funded once, so every game transaction is signed with no
 * wallet popup — and a player needs no wallet of their own. The same `Actor` drives the human's seat and the house bot's seat.
 *
 * Monad specifics handled here (see docs/TECH_ARCHITECTURE.md §1):
 *  • gas is charged on the LIMIT, so each call estimates its own gas and adds only a small buffer;
 *  • a wallet under 10 MON gets ONE transaction per ~3 blocks (reserve-balance rule), and a freshly funded account must wait ~3 blocks:
 *    `Actor.send` spaces its own transactions by block number (with a time fallback for chains that only mine on demand).
 */
export interface Addresses {
  arena: Address;
  armory: Address;
  cards: Address;
}

export interface TxLog {
  /** who sent it: the human's guest wallet or the house bot */
  who: "you" | "house";
  label: string;
  hash: Hex;
  block: bigint;
  /** wall-clock milliseconds from "send" to "receipt in hand" */
  ms: number;
}

type Pub = PublicClient<Transport, Chain>;
type Wal = WalletClient<Transport, Chain, Account>;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Actor {
  private lastBlock = 0n;
  private lastSentAt = 0;
  /** blocks to leave between this wallet's own transactions, and how long to wait instead on a chain that only mines on demand */
  spacing = { blocks: 3n, fallbackMs: 2500 };

  constructor(
    readonly who: "you" | "house",
    readonly publicClient: Pub,
    readonly walletClient: Wal,
    readonly addrs: Addresses,
    private onTx: (t: TxLog) => void = () => {},
  ) {}

  get address(): Address {
    return this.walletClient.account.address;
  }

  /** wait until at least 3 blocks have passed since this wallet's last transaction (or 2.5 s, on a chain that mines on demand) */
  private async spaced(): Promise<void> {
    for (;;) {
      const waited = Date.now() - this.lastSentAt;
      if (this.lastBlock === 0n || waited > this.spacing.fallbackMs) return;
      const head = await this.publicClient.getBlockNumber();
      if (head >= this.lastBlock + this.spacing.blocks) return;
      await sleep(120);
    }
  }

  /** one contract call: estimate, send, wait for the receipt, log it. Returns the simulated return value. */
  async call<T = unknown>(label: string, req: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }): Promise<T> {
    await this.spaced();
    const base = { account: this.walletClient.account, address: req.address, abi: req.abi, functionName: req.functionName, args: req.args ?? [], value: req.value } as never;
    const sim = await this.publicClient.simulateContract(base); // a revert surfaces here with its reason, before any gas is spent
    const est = await this.publicClient.estimateContractGas(base);
    const gas = est + est / 7n; // Monad charges the limit: keep the buffer small
    const t0 = Date.now();
    const hash = await this.walletClient.writeContract({ ...(sim as { request: object }).request, gas } as never);
    this.lastSentAt = Date.now();
    const rc = await this.publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
    this.lastBlock = rc.blockNumber;
    this.onTx({ who: this.who, label, hash, block: rc.blockNumber, ms: Date.now() - t0 });
    if (rc.status !== "success") throw new Error(`${label} reverted on chain`);
    return (sim as { result: T }).result;
  }

  /** plain MON transfer (gas is always 21,000) */
  async transfer(label: string, to: Address, value: bigint): Promise<void> {
    await this.spaced();
    const t0 = Date.now();
    const hash = await this.walletClient.sendTransaction({ to, value, gas: 21000n });
    this.lastSentAt = Date.now();
    const rc = await this.publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
    this.lastBlock = rc.blockNumber;
    this.onTx({ who: this.who, label, hash, block: rc.blockNumber, ms: Date.now() - t0 });
    if (rc.status !== "success") throw new Error(`${label} reverted on chain`);
  }

  /**
   * A Lite pool for this wallet: claim the free starter cards (2 fighters + 1 trick, once per wallet) and register them.
   * `remembered` is a pool id from an earlier session; it is reused if it still exists and is idle.
   */
  async ensureLitePool(presets: { a: number; b: number; trick: number }, remembered?: bigint): Promise<bigint> {
    if (remembered !== undefined) {
      try {
        const info = (await this.publicClient.readContract({ address: this.addrs.armory, abi: armoryAbi, functionName: "poolInfo", args: [remembered] })) as readonly [Address, number, number, boolean, boolean];
        if (info[0].toLowerCase() === this.address.toLowerCase() && info[3] && !info[4]) return remembered;
      } catch {
        /* fall through and build a new one */
      }
    }
    const claimed = (await this.publicClient.readContract({ address: this.addrs.cards, abi: cardsAbi, functionName: "starterClaimed", args: [this.address] })) as boolean;
    if (claimed) throw new Error("This wallet already used its free starter cards and its remembered pool is gone — reset the guest wallet.");
    const [f0, f1, t0] = await this.call<readonly [bigint, bigint, bigint]>("claim starter cards", { address: this.addrs.cards, abi: cardsAbi, functionName: "claimStarter", args: [presets.a, presets.b, presets.trick] });
    return this.call<bigint>("register Lite pool", { address: this.addrs.armory, abi: armoryAbi, functionName: "register", args: [0, [f0, f1, t0]] });
  }
}

/** the house bot: plays the seat it is given with the equilibrium bot until the bout is over */
export async function houseLoop(opts: { seat: Seat; side: 0 | 1; actor: Actor; rng?: Rng; stop?: () => boolean; onError?: (e: unknown) => void }): Promise<void> {
  const { seat, side, stop } = opts;
  const rng = opts.rng ?? mulberry32(Date.now() & 0xffffff);
  const chosen = new Map<string, number>();
  const sealed = (tag: number, turn: number) => `${tag}:${turn}`;
  for (let idle = 0; ; ) {
    if (stop?.()) return;
    let meta: BoutMeta;
    try {
      meta = await seat.meta();
    } catch (e) {
      opts.onError?.(e);
      await sleep(400);
      continue;
    }
    if (meta.phase === "Over" || meta.phase === "Void" || meta.phase === "Cancelled") return;
    try {
      let acted = true;
      if (meta.phase === "LeadCommit" && !meta.committed[side]) await seat.commitLead(0, 0);
      else if (meta.phase === "LeadReveal" && !meta.revealed[side]) await seat.revealLead(0, 0);
      else if (meta.phase === "TurnCommit" && !meta.committed[side]) {
        const v = await seat.view();
        if (!v) throw new Error("no state yet");
        const turn = v.state.turn;
        const a = chosen.get(sealed(TAG.ACTION, turn)) ?? eqBot(v.state, side, rng);
        chosen.set(sealed(TAG.ACTION, turn), a);
        await seat.commit(TAG.ACTION, turn, a);
      } else if (meta.phase === "TurnReveal" && !meta.revealed[side]) {
        const v = await seat.view();
        if (!v) throw new Error("no state yet");
        const turn = v.state.turn;
        const a = chosen.get(sealed(TAG.ACTION, turn));
        if (a === undefined) throw new Error("house lost its own sealed move"); // cannot happen within one page session
        await seat.reveal(TAG.ACTION, turn, a);
      } else if (meta.phase === "ReplaceCommit" && meta.mustAct[side] && !meta.committed[side]) {
        const v = await seat.view();
        if (!v) throw new Error("no state yet");
        const slot = firstReplacement(v.state, side);
        chosen.set(sealed(TAG.REPLACE, v.state.turn), slot);
        await seat.commit(TAG.REPLACE, v.state.turn, slot);
      } else if (meta.phase === "ReplaceReveal" && meta.mustAct[side] && !meta.revealed[side]) {
        const v = await seat.view();
        if (!v) throw new Error("no state yet");
        const slot = chosen.get(sealed(TAG.REPLACE, v.state.turn));
        if (slot === undefined) throw new Error("house lost its own sealed replacement");
        await seat.reveal(TAG.REPLACE, v.state.turn, slot);
      } else acted = false;
      idle = acted ? 0 : idle + 1;
    } catch (e) {
      opts.onError?.(e);
      await sleep(600);
    }
    await sleep(300); // be kind to the public RPC: ~3 reads a second per seat
  }
}

export const firstReplacement = (state: BoutState, side: 0 | 1): number => legalReplacements(state, side)[0] ?? 0;

/** the name of a starter preset, for display */
export const presetName = (i: number): string => PRESETS[i]?.name ?? `Fighter ${i}`;

/* ------------------------------------------------------------------------------------------------------------------ */
/* setting up and playing a duel                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */
import { secretMessage, deriveSecrets } from "./secrets";

const ARENA_LABELS: Record<string, string> = { commit: "seal move", reveal: "reveal move", revealLead: "reveal lead", revealOpen: "reveal + open card", openCards: "open cards" };

/** a Seat whose every transaction runs through `actor` (so it is estimated, spaced and logged) */
export function seatFor(actor: Actor, boutId: bigint, side: 0 | 1, secrets: ReturnType<typeof deriveSecrets>): Seat {
  return new Seat({
    publicClient: actor.publicClient,
    walletClient: actor.walletClient,
    arena: actor.addrs.arena,
    boutId,
    side,
    secrets,
    onSend: async (fn, args) => {
      await actor.call(ARENA_LABELS[fn] ?? fn, { address: actor.addrs.arena, abi: arenaAbi, functionName: fn, args });
    },
  });
}

/** derive a wallet's secrets for one bout from ONE local signature (deterministic, so a refresh can recover them) */
export async function secretsFor(actor: Actor, boutId: bigint, side: 0 | 1): Promise<ReturnType<typeof deriveSecrets>> {
  const msg = secretMessage(BigInt(actor.publicClient.chain.id), actor.addrs.arena, boutId, side);
  return deriveSecrets(await actor.walletClient.signMessage({ message: msg }));
}

export interface Duel {
  boutId: bigint;
  poolYou: bigint;
  poolHouse: bigint;
  you: Seat;
  house: Seat;
}

/** claim cards + register pools for both wallets, open a challenge, let the house accept it, and build both seats */
export async function startDuel(o: {
  you: Actor;
  house: Actor;
  youPresets: { a: number; b: number; trick: number };
  housePresets: { a: number; b: number; trick: number };
  remembered?: { you?: bigint; house?: bigint };
  step?: (s: string) => void;
}): Promise<Duel> {
  const step = o.step ?? (() => {});
  step("Your guest wallet claims its free starter cards");
  const poolYou = await o.you.ensureLitePool(o.youPresets, o.remembered?.you);
  step("The house fighter claims its cards");
  const poolHouse = await o.house.ensureLitePool(o.housePresets, o.remembered?.house);
  step("You open a challenge");
  const boutId = await o.you.call<bigint>("open challenge", { address: o.you.addrs.arena, abi: arenaAbi, functionName: "createChallenge", args: [0, poolYou] });
  step("The house accepts");
  await o.house.call("accept challenge", { address: o.house.addrs.arena, abi: arenaAbi, functionName: "acceptChallenge", args: [boutId, poolHouse] });
  step("Deriving your secret move salts from one local signature");
  const [sY, sH] = await Promise.all([secretsFor(o.you, boutId, 0), secretsFor(o.house, boutId, 1)]);
  return { boutId, poolYou, poolHouse, you: seatFor(o.you, boutId, 0, sY), house: seatFor(o.house, boutId, 1, sH) };
}

/** poll the Arena until `ok(meta)` (or the bout is over / the timeout passes) */
export async function waitFor(seat: Seat, ok: (m: BoutMeta) => boolean, timeoutMs = 120_000): Promise<BoutMeta> {
  const t0 = Date.now();
  for (;;) {
    const m = await seat.meta();
    if (ok(m) || m.phase === "Over" || m.phase === "Void" || m.phase === "Cancelled") return m;
    if (Date.now() - t0 > timeoutMs) throw new Error("timed out waiting for the other side");
    await sleep(260);
  }
}

/** the human's lead: seal it, wait for the house, reveal it, wait for turn 1 */
export async function playLead(seat: Seat, lead = 0): Promise<void> {
  await seat.commitLead(0, lead);
  await waitFor(seat, (m) => m.phase === "LeadReveal" || m.revealed[0]);
  await seat.revealLead(0, lead);
  await waitFor(seat, (m) => m.phase === "TurnCommit" || m.phase === "Over");
}

/** the human's turn: seal the move, wait for the house to seal, reveal, wait until the turn has resolved */
export async function playTurn(seat: Seat, turn: number, action: number): Promise<BoutMeta> {
  await seat.commit(TAG.ACTION, turn, action);
  await waitFor(seat, (m) => m.phase === "TurnReveal" || (m.phase !== "TurnCommit" && m.phase !== "LeadReveal"));
  await seat.reveal(TAG.ACTION, turn, action);
  return waitFor(seat, (m) => m.phase !== "TurnReveal");
}

/** what `side` revealed for an action this turn, read from the public `Revealed` events (recent blocks only: the RPC caps eth_getLogs at 100) */
export async function readRevealedAction(publicClient: Pub, arena: Address, boutId: bigint, side: 0 | 1): Promise<number | null> {
  const head = await publicClient.getBlockNumber();
  const logs = await publicClient.getContractEvents({ address: arena, abi: arenaAbi, eventName: "Revealed", args: { boutId }, fromBlock: head > 90n ? head - 90n : 0n, toBlock: head });
  const mine = logs.filter((l) => Number((l.args as { side?: number }).side) === side && Number((l.args as { tag?: number }).tag) === TAG.ACTION);
  const last = mine[mine.length - 1];
  return last ? Number((last.args as { choice?: number }).choice) : null;
}
