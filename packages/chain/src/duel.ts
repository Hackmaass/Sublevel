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
  private lastSentAt = 0;
  private nonce: number | null = null;
  private fees: { at: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null = null;
  /** `eth_sendRawTransactionSync` (receipt in the same call, no polling). Cleared if the RPC doesn't support it. */
  private syncSend = true;
  /**
   * Gap to leave after this wallet's last receipt before it sends again. Monad: an account under 10 MON gets ONE transaction per ~3
   * blocks (~0.4 s each). Time-based on purpose: polling the block number to measure it would multiply the RPC load.
   */
  spacing = { ms: 1500 };
  /** gas limit = estimate × this (Monad charges the limit, so keep it modest; floors and the retry below cover the rest) */
  gasScale = 1.3;

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

  private async spaced(): Promise<void> {
    const wait = this.lastSentAt + this.spacing.ms - Date.now();
    if (wait > 0) await sleep(wait);
  }

  /** this wallet's next nonce, tracked locally (a lagging fallback RPC can't hand us a stale one); refetched after any failure */
  private async nextNonce(): Promise<number> {
    if (this.nonce === null) this.nonce = await this.publicClient.getTransactionCount({ address: this.address, blockTag: "pending" });
    return this.nonce++;
  }

  /** fee caps, refreshed at most every 20 s (Monad charges the actual price, so a generous cap costs nothing extra) */
  private async feeCaps(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    if (!this.fees || Date.now() - this.fees.at > 20_000) {
      const f = await this.publicClient.estimateFeesPerGas();
      this.fees = { at: Date.now(), maxFeePerGas: (f.maxFeePerGas * 3n) / 2n, maxPriorityFeePerGas: f.maxPriorityFeePerGas };
    }
    return this.fees;
  }

  private async finish(label: string, hash: Hex | null, receipt: { status: string; blockNumber: bigint; transactionHash: Hex; gasUsed?: bigint }, t0: number, gas?: bigint): Promise<void> {
    this.lastSentAt = Date.now();
    this.onTx({ who: this.who, label, hash: hash ?? receipt.transactionHash, block: receipt.blockNumber, ms: Date.now() - t0 });
    if (receipt.status !== "success") {
      // On Monad a transaction that runs out of gas is mined, reverted, and charged for its whole limit. Typical cause: gas was estimated for
      // the cheap path (first to reveal) but this transaction landed second and had to resolve the turn. State is unchanged, so retry bigger.
      if (gas !== undefined && receipt.gasUsed !== undefined && receipt.gasUsed >= gas - 1n) throw new OutOfGas(label);
      throw new Error(`${label} reverted on chain`);
    }
  }

  /** the send itself: sync when the RPC supports it, otherwise send + wait for the receipt (slow polling) */
  private async dispatch(label: string, gas: bigint | undefined, send: { sync: () => Promise<{ status: string; blockNumber: bigint; transactionHash: Hex; gasUsed?: bigint }>; plain: () => Promise<Hex> }): Promise<void> {
    const t0 = Date.now();
    try {
      if (this.syncSend) {
        try {
          const rc = await send.sync();
          return await this.finish(label, null, rc, t0, gas);
        } catch (e) {
          const m = String((e as { message?: string; shortMessage?: string }).message ?? e) + String((e as { details?: string }).details ?? "");
          if (!/not (found|supported|exist)|unsupported|unknown method|-32601|does not exist/i.test(m)) throw e;
          this.syncSend = false; // this RPC has no sync send: use the plain path from now on
        }
      }
      const hash = await send.plain();
      const rc = await this.publicClient.waitForTransactionReceipt({ hash, pollingInterval: 500, timeout: 60_000 });
      await this.finish(label, hash, rc, t0, gas);
    } catch (e) {
      if (!(e instanceof OutOfGas)) this.nonce = null; // a mined (even reverted) tx used its nonce; anything else: re-read it next time
      throw e;
    }
  }

  /**
   * One contract call: estimate gas (a revert surfaces here with its reason, before any gas is spent), send, log.
   * `result: true` also runs a simulation first to return the call's return value (setup calls only: it costs an extra read).
   */
  async call<T = unknown>(label: string, req: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }, opts: { result?: boolean; minGas?: bigint } = {}): Promise<T> {
    await this.spaced();
    const base = { account: this.walletClient.account, address: req.address, abi: req.abi, functionName: req.functionName, args: req.args ?? [], value: req.value } as never;
    let result: unknown;
    if (opts.result) result = ((await this.publicClient.simulateContract(base)) as { result: unknown }).result;
    const est = await this.publicClient.estimateContractGas(base);
    let gas = BigInt(Math.ceil(Number(est) * this.gasScale));
    if (opts.minGas !== undefined && gas < opts.minGas) gas = opts.minGas;
    for (let attempt = 0; ; attempt++) {
      const [fees, nonce] = await Promise.all([this.feeCaps(), this.nextNonce()]);
      const tx = { ...(base as object), gas, nonce, ...fees } as never;
      try {
        await this.dispatch(label, gas, {
          sync: () => (this.walletClient as unknown as { writeContractSync: (a: never) => Promise<{ status: string; blockNumber: bigint; transactionHash: Hex; gasUsed?: bigint }> }).writeContractSync(tx),
          plain: () => this.walletClient.writeContract(tx),
        });
        return result as T;
      } catch (e) {
        if (!(e instanceof OutOfGas) || attempt >= 1) throw e;
        gas = est * 3n > gas * 3n ? est * 3n : gas * 3n; // out of gas, state unchanged: go again with real room to spare
        await sleep(this.spacing.ms);
      }
    }
  }

  /** plain MON transfer (gas is always 21,000) */
  async transfer(label: string, to: Address, value: bigint): Promise<void> {
    await this.spaced();
    const [fees, nonce] = await Promise.all([this.feeCaps(), this.nextNonce()]);
    const tx = { to, value, gas: 21000n, nonce, ...fees } as never;
    await this.dispatch(label, 21000n, {
      sync: () => (this.walletClient as unknown as { sendTransactionSync: (a: never) => Promise<{ status: string; blockNumber: bigint; transactionHash: Hex }> }).sendTransactionSync(tx),
      plain: () => this.walletClient.sendTransaction(tx),
    });
  }

  /**
   * A Lite pool for this wallet: claim the free starter cards (2 fighters + 1 trick, once per wallet) and register them.
   * Resumable: `remembered` is a pool id from an earlier session (reused if it still exists and is idle), `onPool` is told the id the moment
   * it exists, and if the starter cards were claimed but the pool was never registered (a flaky network cut setup short) they are re-found.
   */
  async ensureLitePool(presets: { a: number; b: number; trick: number }, remembered?: bigint, onPool?: (id: bigint) => void): Promise<bigint> {
    if (remembered !== undefined) {
      try {
        const info = (await this.publicClient.readContract({ address: this.addrs.armory, abi: armoryAbi, functionName: "poolInfo", args: [remembered] })) as readonly [Address, number, number, boolean, boolean];
        if (info[0].toLowerCase() === this.address.toLowerCase() && info[3] && !info[4]) return remembered;
      } catch {
        /* fall through and build a new one */
      }
    }
    const claimed = (await this.publicClient.readContract({ address: this.addrs.cards, abi: cardsAbi, functionName: "starterClaimed", args: [this.address] })) as boolean;
    let ids: [bigint, bigint, bigint];
    if (!claimed) {
      const r = await this.call<readonly [bigint, bigint, bigint]>("claim starter cards", { address: this.addrs.cards, abi: cardsAbi, functionName: "claimStarter", args: [presets.a, presets.b, presets.trick] }, { result: true });
      ids = [r[0], r[1], r[2]];
    } else {
      ids = await this.findStarterCards();
    }
    const pool = await this.call<bigint>("register Lite pool", { address: this.addrs.armory, abi: armoryAbi, functionName: "register", args: [0, ids] }, { result: true });
    onPool?.(pool);
    return pool;
  }

  /**
   * A pool is "in a bout" until the bout ends. If an earlier duel was abandoned (tab closed, network died) its cards stay locked until the
   * 90 s phase deadline passes and anyone calls `claimTimeout`. This does that when it can, and says how long to wait when it can't.
   */
  async releaseIfStuck(poolId: bigint): Promise<{ state: "free" | "released" | "busy"; waitSeconds?: number }> {
    const info = (await this.publicClient.readContract({ address: this.addrs.armory, abi: armoryAbi, functionName: "poolInfo", args: [poolId] })) as readonly [Address, number, number, boolean, boolean];
    if (!info[4]) return { state: "free" };
    const next = (await this.publicClient.readContract({ address: this.addrs.arena, abi: arenaAbi, functionName: "nextBout" })) as bigint;
    for (let id = next - 1n; id >= 0n && id >= next - 10n; id--) {
      const b = (await this.publicClient.readContract({ address: this.addrs.arena, abi: arenaAbi, functionName: "getBout", args: [id] })) as readonly [readonly Address[], readonly bigint[], number, number, bigint, ...unknown[]];
      const phase = b[3];
      const mine = b[1][0] === poolId || b[1][1] === poolId;
      const active = (phase >= 2 && phase <= 7) || phase === 11;
      if (!mine || !active) continue;
      const chainNow = Number((await this.publicClient.getBlock()).timestamp); // the CHAIN's clock decides deadlines, not this computer's
      const left = Number(b[4]) - chainNow;
      if (left > 0) return { state: "busy", waitSeconds: left + 3 };
      await this.call("clear an abandoned bout", { address: this.addrs.arena, abi: arenaAbi, functionName: "claimTimeout", args: [id] });
      return { state: "released" };
    }
    return { state: "free" };
  }

  /** after a half-finished setup: this wallet's unlocked cards, as [fighter, fighter, trick] */
  private async findStarterCards(): Promise<[bigint, bigint, bigint]> {
    const owned = (await this.publicClient.readContract({ address: this.addrs.cards, abi: cardsAbi, functionName: "cardsOf", args: [this.address, 0n, 40n] })) as readonly bigint[];
    const fighters: bigint[] = [];
    const tricks: bigint[] = [];
    for (const id of owned) {
      const locked = (await this.publicClient.readContract({ address: this.addrs.cards, abi: cardsAbi, functionName: "locked", args: [id] })) as boolean;
      if (locked) continue;
      const c = (await this.publicClient.readContract({ address: this.addrs.cards, abi: cardsAbi, functionName: "cardData", args: [id] })) as { kind: number };
      (c.kind === 0 ? fighters : tricks).push(id);
    }
    if (fighters.length < 2 || tricks.length < 1) throw new Error("This guest wallet's cards are all in use. Use \"forget this guest wallet\" and start again.");
    return [fighters[0]!, fighters[1]!, tricks[0]!];
  }
}

class OutOfGas extends Error {
  constructor(label: string) {
    super(`${label} ran out of gas`);
  }
}

/** the house bot: plays the seat it is given with the equilibrium bot until the bout is over */
export async function houseLoop(opts: { seat: Seat; side: 0 | 1; actor: Actor; rng?: Rng; stop?: () => boolean; onError?: (e: unknown) => void }): Promise<void> {
  const { seat, side, stop } = opts;
  const rng = opts.rng ?? mulberry32(Date.now() & 0xffffff);
  const chosen = new Map<string, number>();
  const sealed = (tag: number, turn: number) => `${tag}:${turn}`;
  // Let the human reveal FIRST: the second reveal also resolves the turn (2-5x the gas), and a seat that estimated its gas just before the
  // other's reveal landed would run out of gas. If the human is slow, the house goes after a grace period (its estimate is then accurate).
  const since = new Map<string, number>();
  const waited = (phase: string): boolean => {
    const t = since.get(phase) ?? Date.now();
    since.set(phase, t);
    return Date.now() - t > 9000;
  };
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
    for (const k of [...since.keys()]) if (k !== meta.phase) since.delete(k);
    try {
      let acted = true;
      if (meta.phase === "LeadCommit" && !meta.committed[side]) await seat.commitLead(0, 0);
      else if (meta.phase === "LeadReveal" && !meta.revealed[side] && (meta.revealed[1 - side] || waited(meta.phase))) await seat.revealLead(0, 0);
      else if (meta.phase === "TurnCommit" && !meta.committed[side]) {
        const v = await seat.view();
        if (!v) throw new Error("no state yet");
        const turn = v.state.turn;
        const a = chosen.get(sealed(TAG.ACTION, turn)) ?? eqBot(v.state, side, rng);
        chosen.set(sealed(TAG.ACTION, turn), a);
        await seat.commit(TAG.ACTION, turn, a);
      } else if (meta.phase === "TurnReveal" && !meta.revealed[side] && (meta.revealed[1 - side] || waited(meta.phase))) {
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
    await sleep(800); // be kind to the public RPC: ~1 read a second per seat
  }
}

export const firstReplacement = (state: BoutState, side: 0 | 1): number => legalReplacements(state, side)[0] ?? 0;

/** the name of a starter preset, for display */
export const presetName = (i: number): string => PRESETS[i]?.name ?? `Fighter ${i}`;

/* ------------------------------------------------------------------------------------------------------------------ */
/* setting up and playing a duel                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */
import { secretMessage, deriveSecrets } from "./secrets";

/**
 * Gas floors from real Monad testnet transactions. A reveal that lands second resolves the turn: seen 345k-373k, and the reveal that ends a
 * bout (KO + career records) needed ~700k. The estimate can be stale when two seats send at once, so these floors keep the limit above it.
 */
const GAS_FLOOR: Record<string, bigint> = { commit: 110_000n, reveal: 400_000n, revealLead: 650_000n, revealOpen: 600_000n, openCards: 700_000n };

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
      await actor.call(ARENA_LABELS[fn] ?? fn, { address: actor.addrs.arena, abi: arenaAbi, functionName: fn, args }, { minGas: GAS_FLOOR[fn] });
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
  /** told each pool id the moment it exists, so an interrupted setup can resume */
  onPool?: (who: "you" | "house", id: bigint) => void;
  step?: (s: string) => void;
}): Promise<Duel> {
  const step = o.step ?? (() => {});
  for (const [who, actor, pool] of [["your", o.you, o.remembered?.you], ["the house", o.house, o.remembered?.house]] as const) {
    if (pool === undefined) continue;
    const r = await actor.releaseIfStuck(pool);
    if (r.state === "busy") throw new Error(`A previous duel is still open on chain (${who} cards are locked in it). It can be cleared in about ${r.waitSeconds} seconds: wait, then press START again.`);
    if (r.state === "released") step(`Cleared an abandoned earlier duel (${who} cards are free again)`);
  }
  step("Your guest wallet claims its free starter cards");
  const poolYou = await o.you.ensureLitePool(o.youPresets, o.remembered?.you, (id) => o.onPool?.("you", id));
  step("The house fighter claims its cards");
  const poolHouse = await o.house.ensureLitePool(o.housePresets, o.remembered?.house, (id) => o.onPool?.("house", id));
  step("You open a challenge");
  const boutId = await o.you.call<bigint>("open challenge", { address: o.you.addrs.arena, abi: arenaAbi, functionName: "createChallenge", args: [0, poolYou] }, { result: true });
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
    await sleep(700);
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
