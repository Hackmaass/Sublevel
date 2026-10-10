# SUBLEVEL contracts

Foundry project (Solidity 0.8.28, OpenZeppelin 5.7). The Foundry binary lives in `../tools/foundry/` (gitignored, checksum-verified); add it to PATH or call `../tools/foundry/forge.exe`.

```
forge build
forge test                       # 63 tests: 1,541 cross-language vectors + 80 whole bouts (40 Full, random hidden hands) replayed through the contracts + unit + negative + fuzz
forge test --match-test test_gas_profile -vv   # Lite + Full flows
```

## What is where
| Contract | Role |
|---|---|
| `Engine.sol` | Pure duel rules, **Rulebook v1** (guard triangle + free unpunished Switch hard-wired). Line-by-line port of `packages/engine/src/engine.ts`. |
| `BoutCodec.sol` | 88 × int16 pack/unpack (the Arena stores a bout in 176 bytes). Same layout as `encode.ts`. |
| `RulebookV1.sol`, `RulebookNames.sol` | **Generated** from the TS rulebook (`pnpm --filter @sublevel/engine solgen`). Never edit by hand. |
| `Cards.sol` | ERC-721 fighters & tricks: immutable build, identity, **record (written only by Arena)**, locks, ERC-4906, on-chain `tokenURI`. Free mint (no payable). |
| `Armory.sol` | Public pools (lock cards), **scoped session keys**. |
| `Ladder.sol` | **Ranked ratings (Elo, per player per format) + the Belt** (one soulbound-to-the-reign ERC-721 per format). Written only by the Arena, only from a settled ranked bout. |
| `Arena.sol` | Challenges, **ranked queue (`joinRanked` pairs the next two entrants)**, secret simultaneous moves (commit → reveal), Full's hidden hands (slot hashes + openings), timeouts, forfeits, settlement. |

## Trust model (what nobody — including us — can do)
- After deployment nobody has any power: `Bootstrap` deploys and wires everything inside its own constructor (so even the account that sent the deploy transaction never holds the one-shot `wire` right), and there is no owner, pause, upgrade, fee or mint-authority. The Arena address that may write records is fixed at wiring.
- **Records** can only be written by the Arena, which only writes them from a finished bout. No transfer, mint or admin path edits a record.
- **A session key** can only `commit` / `reveal` / `revealOpen` / `revealLead` / `openCards` / `openAfter` for the owner who authorised it. It can't register/unregister pools, create/accept/cancel challenges, transfer, approve, or lock anything, and `commit` is write-once per phase (it can't overwrite the owner's commit). **Scope is per owner, not per bout:** a leaked key can make the owner forfeit every bout that seat plays until it expires (≤ 7 days; the client issues short, fresh keys per session) or the owner calls `revokeSession`. It can never touch cards, pools or records.
- **Fairness:** commit = `keccak(chainId, arena, boutId, turn, PHASE_TAG, player, choice, salt)`. Phase tags (`LEAD | ACTION | REPLACE`) mean a salt revealed in one phase can't open a commit in another, and every `(side, tag, turn)` is committed at most once per bout (asserted in the replay test — the client's deterministic salts depend on it). A mismatching or illegal reveal **forfeits**. A missed deadline forfeits; both missing **voids**.
- **Full (hidden hands):** the lead commit binds the lead slot + five per-slot blinded hashes. A card is *opened* in the same tx as the move that first needs it; each opening must match its slot hash, be in the locked pool, fit the slot kind and not repeat a card — else forfeit. Only a tied turn-cap decision or sudden-death re-entry forces unplayed fighters open (`OpenCards` phase, deadline → forfeit). Tricks never need to be opened for the result.
- **No randomness** anywhere (no `prevrandao`, no VRF) and **no ETH/MON handling** (no payable function, no transfers) → no reentrancy or custody surface.

## Known limits (be honest about these)
1. **Full's privacy is only as good as the client's salts.** Slot salts must be unpredictable (the front end derives them from a wallet-signed secret; never from `boutId` alone). Information that *is* public on-chain: the pool, the lead, every card once it enters play, which slots are alive, and — after a switch — which fighter is now active. Who plays first with an opening also shows the opponent that reveal before they decide whether to reveal (they can only forfeit, same as Lite).
2. **Card records are UNRANKED (v1).** Challenge play can be farmed with alt wallets; `tokenURI` says "Record scope: Unranked (v1)". **Ratings and the Belt come only from the ranked queue** (`Arena.joinRanked` → `Ladder`), which is first come, first served. What it does NOT stop: (a) one person with two wallets (sybil) — Elo makes farming a weak alt nearly worthless (rating gaps stall near 600 points) but a holder who throws a bout to their own alt can still pass the belt; (b) the second entrant can *see* who is waiting and decline to join, so cherry-picking an opponent is possible (unprofitable for rating, not for a belt defence); (c) rating belongs to the wallet, not a fighter card. A walk-out after being paired is a rated forfeit; a bout nobody shows up for is void and changes nothing.
3. **Gas numbers are EVM-priced.** Monad's cold storage/account access is ~4× dearer — re-measure on testnet. `gas-limits.json` holds padded limits (Monad charges the gas *limit*).
4. **Contract size:** `Arena` runtime ≈ 38.9 KB (> 24 KB EVM limit). Fine on Monad (128 KB limit) but it will not deploy on an EIP-170 chain.
5. **Phase timeout = 90 s** (UI clock is shorter) so slow RPCs and Monad's 1-tx-per-3-blocks rule for low-balance accounts can't cause accidental forfeits.
6. **No audit.** Not formally verified; not slither-scanned in this environment. Mutation checks done by hand: removing the duplicate-card or slot-kind check fails the cheat tests.
7. `Cards.cardsOf` is a linear scan (testnet scale); the indexer is the production path. **Never rely on `eth_getLogs` backfill** — the public RPC caps it at 100 blocks; read views and subscribe.

## Events for the indexer / UI
`RankedQueued · RankedLeft · RankedMatched · Ladder.Rated · Ladder.BeltChanged · Ladder.BeltDefended` (ranked), `ChallengeCreated · ChallengeAccepted · PhaseChanged(boutId, phase, deadline) · Committed · Revealed · BoutStarted(state) · TurnResolved(boutId, turn, state, events) · ReplacementApplied · BoutEnded(winner, reason, state) · BoutVoided`, and `Cards.Recorded` + ERC-4906 `MetadataUpdate`. State/events use the packed encoding in `packages/engine/src/encode.ts`.

## Deploying
`script/Deploy.s.sol` sends ONE transaction: `Bootstrap` (deploys Cards, Armory, Ladder, Arena and wires them; init code ≈ 75 KB, ≈ 15 M EVM gas — re-measure on Monad). It works the same from an EOA, a smart wallet or a factory such as CreateX. For Monad testnet use an **Alchemy Agent Wallet session** + CreateX (monskills `wallet` skill) — never a raw private key. Then verify with the monskills verification API (see `scaffold`).
