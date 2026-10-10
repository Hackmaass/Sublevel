import { type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { decodeState, unpackHex, type ChainView } from "@sublevel/engine";
import { arenaAbi } from "./abi.generated";
import { commitHash, fullLeadHash, slotHash } from "./hashes";
import type { Secrets } from "./secrets";

export const TAG = { LEAD: 0, ACTION: 1, REPLACE: 2 } as const;
export const PHASE = ["None", "Open", "LeadCommit", "LeadReveal", "TurnCommit", "TurnReveal", "ReplaceCommit", "ReplaceReveal", "Over", "Void", "Cancelled", "OpenCards"] as const;
export type PhaseName = (typeof PHASE)[number];

export interface BoutMeta {
  players: [Address, Address];
  pools: [bigint, bigint];
  format: 0 | 1;
  phase: PhaseName;
  deadline: bigint;
  committed: [boolean, boolean];
  revealed: [boolean, boolean];
  /** replacement / open phases: which sides must act */
  mustAct: [boolean, boolean];
  winner: number; // -1 none, 0/1, 2 draw
  reason: number;
}

/**
 * One player's seat in one bout: every on-chain call a client makes, with the commitments computed exactly as the Arena checks them.
 * All secrets come from `Secrets` (derived from a wallet signature), so a fresh page can resume a bout in progress.
 * Full: `hand` is the 5 card ids behind the hidden slots (0–2 fighters, 3–4 tricks).
 */
export class Seat {
  constructor(
    private o: {
      publicClient: PublicClient<Transport, Chain>;
      walletClient: WalletClient<Transport, Chain, Account>;
      arena: Address;
      boutId: bigint;
      side: 0 | 1;
      secrets: Secrets;
      hand?: readonly bigint[];
      /** route every transaction through the caller (gas estimation, Monad's 1-tx-per-3-blocks spacing, a ledger) instead of a bare writeContract */
      onSend?: (functionName: string, args: readonly unknown[]) => Promise<void>;
    },
  ) {}

  private async send(functionName: string, args: readonly unknown[]): Promise<void> {
    if (this.o.onSend) return this.o.onSend(functionName, args);
    const hash = await this.o.walletClient.writeContract({ address: this.o.arena, abi: arenaAbi, functionName, args } as never);
    const r = await this.o.publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
  }

  private read<T>(functionName: string, args: readonly unknown[]): Promise<T> {
    return this.o.publicClient.readContract({ address: this.o.arena, abi: arenaAbi, functionName, args } as never) as Promise<T>;
  }

  async meta(): Promise<BoutMeta> {
    const r = await this.read<readonly [readonly [Address, Address], readonly [bigint, bigint], number, number, bigint, readonly [boolean, boolean], readonly [boolean, boolean], readonly [boolean, boolean], number, number]>("getBout", [this.o.boutId]);
    return { players: [r[0][0], r[0][1]], pools: [r[1][0], r[1][1]], format: r[2] as 0 | 1, phase: PHASE[r[3]]!, deadline: r[4], committed: [r[5][0], r[5][1]], revealed: [r[6][0], r[6][1]], mustAct: [r[7][0], r[7][1]], winner: r[8], reason: r[9] };
  }

  /** decoded engine state, or null before the leads are revealed */
  async view(): Promise<ChainView | null> {
    const hex = await this.read<Hex>("getState", [this.o.boutId]);
    if (hex === "0x") return null;
    return decodeState(unpackHex(hex));
  }

  private chainId(): bigint {
    return BigInt(this.o.publicClient.chain.id);
  }

  private slotHashes(): Hex[] {
    const hand = this.o.hand;
    if (!hand || hand.length !== 5) throw new Error("Full needs a 5-card hand");
    return hand.map((cardId, slot) => slotHash({ chainId: this.chainId(), arena: this.o.arena, boutId: this.o.boutId, side: this.o.side, slot, cardId, salt: this.o.secrets.slotSalt(slot) }));
  }

  private opening(slot: number) {
    return { slot, cardId: this.o.hand![slot]!, salt: this.o.secrets.slotSalt(slot) };
  }

  /* ---------------- lead ---------------- */
  async commitLead(format: 0 | 1, lead: number): Promise<void> {
    const player = this.o.walletClient.account.address;
    const hash =
      format === 1
        ? fullLeadHash({ chainId: this.chainId(), arena: this.o.arena, boutId: this.o.boutId, player, lead, slotHashes: this.slotHashes(), salt: this.o.secrets.leadSalt })
        : commitHash({ chainId: this.chainId(), arena: this.o.arena, boutId: this.o.boutId, turn: 0, tag: TAG.LEAD, player, choice: lead, salt: this.o.secrets.phaseSalt(TAG.LEAD, 0) });
    await this.send("commit", [this.o.boutId, this.o.side, hash]);
  }

  async revealLead(format: 0 | 1, lead: number): Promise<void> {
    if (format === 1) await this.send("revealLead", [this.o.boutId, this.o.side, lead, this.slotHashes(), this.o.secrets.leadSalt, this.opening(lead)]);
    else await this.send("reveal", [this.o.boutId, this.o.side, lead, this.o.secrets.phaseSalt(TAG.LEAD, 0)]);
  }

  /* ---------------- action / replacement ---------------- */
  async commit(tag: number, turn: number, choice: number): Promise<void> {
    const hash = commitHash({ chainId: this.chainId(), arena: this.o.arena, boutId: this.o.boutId, turn, tag, player: this.o.walletClient.account.address, choice, salt: this.o.secrets.phaseSalt(tag, turn) });
    await this.send("commit", [this.o.boutId, this.o.side, hash]);
  }

  /** which hidden slot (if any) this choice brings into play, judged from the current on-chain state */
  private async slotToOpen(tag: number, choice: number): Promise<number | null> {
    const v = await this.view();
    if (!v || (this.o.hand === undefined)) return null;
    const side = this.o.side;
    if (tag === TAG.REPLACE) return v.unopened[side][choice] ? choice : null;
    if (choice >= 3 && choice <= 5) return v.unopened[side][choice - 3] ? choice - 3 : null;
    if (choice === 6 || choice === 7) return v.unopenedTricks[side][choice - 6] ? 3 + (choice - 6) : null;
    return null;
  }

  async reveal(tag: number, turn: number, choice: number): Promise<void> {
    const salt = this.o.secrets.phaseSalt(tag, turn);
    const slot = await this.slotToOpen(tag, choice);
    if (slot === null) await this.send("reveal", [this.o.boutId, this.o.side, choice, salt]);
    else await this.send("revealOpen", [this.o.boutId, this.o.side, choice, salt, this.opening(slot)]);
  }

  /* ---------------- hidden cards ---------------- */
  /** the OpenCards pause: open exactly the slots the Arena asks of this side */
  async openRequired(): Promise<void> {
    const [, , , need] = await this.read<readonly [unknown, unknown, readonly [number, number], readonly [number, number]]>("getHidden", [this.o.boutId]);
    const mask = need[this.o.side];
    const ops = [0, 1, 2, 3, 4].filter((s) => (mask >> s) & 1).map((s) => this.opening(s));
    if (ops.length) await this.send("openCards", [this.o.boutId, this.o.side, ops]);
  }

  /** after the bout: publish the rest of the hand (cosmetic) */
  async openRest(): Promise<void> {
    const [, , openMask] = await this.read<readonly [unknown, unknown, readonly [number, number], readonly [number, number]]>("getHidden", [this.o.boutId]);
    const ops = [0, 1, 2, 3, 4].filter((s) => !((openMask[this.o.side] >> s) & 1)).map((s) => this.opening(s));
    if (ops.length) await this.send("openAfter", [this.o.boutId, this.o.side, ops]);
  }
}
