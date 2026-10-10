import { concat, keccak256, stringToHex, type Address, type Hex } from "viem";

/**
 * SECRETS THAT SURVIVE A PAGE REFRESH.
 * A Full bout needs 6 secrets for its whole length (lead salt + 5 slot salts) plus a salt per commit. If they only lived in memory a
 * refresh would forfeit the bout. So they are derived from ONE wallet signature over a per-bout message:
 *   signature (deterministic ECDSA, RFC 6979 — what MetaMask/viem local accounts produce) → master = keccak(signature) → keccak(master, label)
 * The owner wallet can re-sign on any device and recover every salt. Nothing secret is stored and nothing public is hashed.
 * (Smart-contract wallets whose signatures are not deterministic can't use this; they would need an encrypted backup instead.)
 */
export function secretMessage(chainId: bigint, arena: Address, boutId: bigint, side: 0 | 1): string {
  return [
    "SUBLEVEL secret v1",
    `chain ${chainId}`,
    `arena ${arena.toLowerCase()}`,
    `bout ${boutId}`,
    `side ${side}`,
    "",
    "Signing derives your private move salts for this one bout.",
    "It does not move funds, approve anything or give anyone access.",
  ].join("\n");
}

export interface Secrets {
  /** Full: salt of the lead commit */
  leadSalt: Hex;
  /** Full: blinding salt of hidden slot i (0–2 fighters, 3–4 tricks) */
  slotSalt(slot: number): Hex;
  /** salt for the commit of (tag, turn) — tag 0 LEAD (Lite), 1 ACTION, 2 REPLACE */
  phaseSalt(tag: number, turn: number): Hex;
}

export function deriveSecrets(signature: Hex): Secrets {
  const master = keccak256(signature);
  const d = (label: string): Hex => keccak256(concat([master, stringToHex(label)]));
  return {
    leadSalt: d("lead"),
    slotSalt: (slot) => d(`slot:${slot}`),
    phaseSalt: (tag, turn) => d(`phase:${tag}:${turn}`),
  };
}
