"use client";

/**
 * THE BELT (read side). `Ladder` is an ERC-721 with one token per format (0 = Lite, 1 = Full). It is minted by the first decisive RANKED
 * bout and afterwards changes hands only when the holder loses a ranked bout — soulbound to the reign. The artwork is built by the contract
 * itself (`tokenURI` returns a data: URI), so what this screen draws for a held belt is exactly what the chain says.
 *
 * Reads happen once when the overlay opens (no polling: the public RPC rate-limits). `ownerOf`/`tokenURI` revert on an unminted token, so
 * they are only called when `reignOf` names a holder.
 */
import { create } from "zustand";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { ladderAbi } from "@sublevel/chain";
import { getDeployment, getGuestKey } from "./chainGame";
import { publicClient } from "./monad";

export type FormatId = 0 | 1;
export const FORMATS: { id: FormatId; name: string; blurb: string }[] = [
  { id: 0, name: "LITE", blurb: "first blood" },
  { id: 1, name: "FULL", blurb: "three fighters, two KOs" },
];

const ZERO = "0x0000000000000000000000000000000000000000";

export interface BeltView {
  format: FormatId;
  holder: Address | null; // null = vacant
  since: number;
  defenses: number;
  reigns: number;
  image: string | null; // data: URI straight from the contract (held belts only)
}

export interface Standing {
  rating: number;
  bouts: number;
  wins: number;
  losses: number;
  draws: number;
}

interface BeltState {
  open: boolean;
  loading: boolean;
  error: string | null;
  ladder: Address | null;
  belts: BeltView[];
  guest: Address | null;
  standing: Record<FormatId, Standing> | null;
  show(): void;
  hide(): void;
  load(): Promise<void>;
}

/** the same SVG the contract draws, for a belt nobody holds yet — stamped VACANT so it can't be mistaken for a minted token */
export function vacantBelt(format: FormatId): string {
  const kind = format === 1 ? "Full" : "Lite";
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'><rect width='600' height='300' fill='#0b0b0c'/>" +
    "<rect x='20' y='20' width='560' height='260' fill='none' stroke='#ff5a1f' stroke-width='8' stroke-dasharray='26 14'/>" +
    "<text x='300' y='120' text-anchor='middle' font-family='Impact,sans-serif' font-size='64' fill='#e9e4d8'>SUBLEVEL</text>" +
    `<text x='300' y='190' text-anchor='middle' font-family='Impact,sans-serif' font-size='48' fill='#ff5a1f'>${kind} CHAMPION</text>` +
    "<text x='300' y='245' text-anchor='middle' font-family='monospace' font-size='15' fill='#8e8a7e'>VACANT - NOT MINTED YET</text></svg>";
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function parseImage(uri: string): string | null {
  try {
    const json = JSON.parse(atob(uri.replace(/^data:application\/json;base64,/, ""))) as { image?: string };
    return typeof json.image === "string" && json.image.startsWith("data:image/svg+xml") ? json.image : null;
  } catch {
    return null;
  }
}

export const useBelt = create<BeltState>((set, get) => ({
  open: false,
  loading: false,
  error: null,
  ladder: null,
  belts: [],
  guest: null,
  standing: null,
  show() {
    set({ open: true });
    void get().load();
  },
  hide: () => set({ open: false }),
  async load() {
    const d = getDeployment();
    if (!d?.ladder) return set({ error: "The contracts are not deployed on this machine yet." });
    const ladder = d.ladder as Address;
    const guest = privateKeyToAccount(getGuestKey()).address;
    set({ loading: true, error: null, ladder, guest });
    try {
      const belts = await Promise.all(
        FORMATS.map(async ({ id }): Promise<BeltView> => {
          const [holder, since, defenses, reigns] = await publicClient.readContract({ address: ladder, abi: ladderAbi, functionName: "reignOf", args: [id] });
          if (holder === ZERO) return { format: id, holder: null, since: 0, defenses: 0, reigns: 0, image: null };
          const uri = await publicClient.readContract({ address: ladder, abi: ladderAbi, functionName: "tokenURI", args: [BigInt(id)] });
          return { format: id, holder, since: Number(since), defenses, reigns, image: parseImage(uri) };
        }),
      );
      const rows = await Promise.all(
        FORMATS.map(async ({ id }): Promise<[FormatId, Standing]> => {
          const [rating, bouts, wins, losses, draws] = await publicClient.readContract({ address: ladder, abi: ladderAbi, functionName: "standingOf", args: [id, guest] });
          return [id, { rating, bouts, wins, losses, draws }];
        }),
      );
      set({ belts, standing: Object.fromEntries(rows) as Record<FormatId, Standing> });
    } catch (e) {
      const raw = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      set({ error: /429|rate.?limit|too many requests/i.test(raw) ? "The public Monad RPC is rate-limiting this connection. Wait a few seconds and press REFRESH." : `Could not read the Ladder: ${raw}` });
    } finally {
      set({ loading: false });
    }
  },
}));
