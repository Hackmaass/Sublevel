import { concat, encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from "viem";

/**
 * The exact commitments the Arena checks. Each mirrors a Solidity `abi.encode` — parity is proven in test/anvil.test.ts by
 * comparing against the contract's own view functions and by playing real bouts.
 */

/** Arena.commitHashOf — Lite lead, and every action / replacement commit */
export function commitHash(a: { chainId: bigint; arena: Address; boutId: bigint; turn: number; tag: number; player: Address; choice: number; salt: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("uint256, address, uint256, uint8, uint8, address, uint8, bytes32"), [a.chainId, a.arena, a.boutId, a.turn, a.tag, a.player, a.choice, a.salt]),
  );
}

/** Arena.slotHashOf — one blinded Full slot */
export function slotHash(a: { chainId: bigint; arena: Address; boutId: bigint; side: number; slot: number; cardId: bigint; salt: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, uint256, address, uint256, uint8, uint8, uint256, bytes32"), ["SUBLEVEL.SLOT", a.chainId, a.arena, a.boutId, a.side, a.slot, a.cardId, a.salt]),
  );
}

/** Arena.fullLeadHashOf — Full lead commit: binds the lead slot and all five slot hashes */
export function fullLeadHash(a: { chainId: bigint; arena: Address; boutId: bigint; player: Address; lead: number; slotHashes: readonly Hex[]; salt: Hex }): Hex {
  if (a.slotHashes.length !== 5) throw new Error("fullLeadHash: need exactly 5 slot hashes");
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, uint256, address, uint256, address, uint8, bytes32, bytes32"), ["SUBLEVEL.FULLLEAD", a.chainId, a.arena, a.boutId, a.player, a.lead, keccak256(concat([...a.slotHashes])), a.salt]),
  );
}
