# Technical Architecture

Status: **DRAFT v2, game only, desktop first.** Interface sketches only — **no scaffolding, no code in the repo yet.** Contracts, cards and bout lifecycle → `NFT_AND_CHAIN.md`. Rules → `CARD_DUEL.md`.

## 1. Verified chain facts (re-check before pitching)

| Fact | Value | Source / method |
|---|---|---|
| Testnet chain id | **10143** | live `eth_chainId` → `0x279f` |
| Testnet RPC / WSS | `https://testnet-rpc.monad.xyz` · `wss://testnet-rpc.monad.xyz` | [current facts](https://docs.monad.xyz/ai/current-facts.md) |
| Faucet | https://faucet.monad.xyz | same |
| Slot / block time | docs: **300 ms** (mainnet figure). **Measured on testnet ≈ 318 ms/block** (68 blocks in 21.65 s, HTTP latency included) | docs + own `eth_blockNumber` sample |
| Finality | docs: 300 ms speculative (1 slot), **600 ms full (2 slots)** | current facts |
| Gas limits | 150M block · 30M per-tx | current facts |
| **Code size limits** | runtime **128 KB** (Ethereum 24 KB), initcode **256 KB** (Ethereum 48 KB); our `Arena` ≈ 39 KB and one-tx `Bootstrap` initcode ≈ 75 KB. Measured Bootstrap deploy ≈ 16.1 M EVM gas (code deposit dominates) | [differences](https://docs.monad.xyz/developer-essentials/differences) (read) + `forge build --sizes` + local anvil deploy |
| **`eth_getLogs` range** | **limited to 100 blocks** on the public testnet RPC (tested: error `-32614 eth_getLogs is limited to a 100 range`; also hit by Promptmon, commit `9774cc3`). 100 blocks ≈ 32 s of history. | own test + Promptmon commit |
| Gas charging | Monad charges `gas_bid × gas_limit` (not gas used); the **reserve-balance** rule can revert txs that overspend an account's MON — use **tight gas limits** and size session-key drips accordingly | [differences](https://docs.monad.xyz/developer-essentials/differences) (via search summary — read before sizing) |
| Public RPC limits | documented for **mainnet only** (15–25 rps per endpoint); testnet limits **unknown** | [network info](https://docs.monad.xyz/developer-essentials/network-information) |
| WS push | `monadNewHeads` / `monadLogs` appear in Street Aura's bundle; **not confirmed in docs we read** | verify in the JSON-RPC reference |
| **Reserve balance** | 10 MON floor per EOA: a tx reverts if the account's ending balance (pre-refund) would drop below `min(starting balance, 10 MON)`. **Accounts under 10 MON can send 1 tx per 3 blocks (~1.2 s).** | [monskills `concepts/reserve-balance`](https://github.com/therealharpaljadeja/monskills) (third-party; read the official page before relying) |
| **Newly funded accounts** | cannot send until the funding tx is ~3 blocks (~1.2 s) old → a session key needs a brief warm-up after its drip; or fund + act atomically via a contract | monskills `concepts/async-execution` |
| **EIP-7702** | delegated EOAs never get the "emptying" exception and always keep the 10 MON floor → **don't use 7702 for session keys** (we use a scoped session-key registry instead) | monskills `concepts/eip-7702` |
| **Sync sends** | `eth_sendRawTransactionSync` returns the receipt in the same call → use it for commit/reveal (wagmi `useSendTransactionSync`) | monskills `scaffold`, `why-monad` |
| Cold storage | cold SLOAD ≈ 8,100 gas, cold account access ≈ 10,100 (vs 2,100 / 2,600) → pack card/bout state tightly; `ecrecover` costs 6,000 | monskills `gas` |
| **Conflicting figures** | monskills says **400 ms blocks / 800 ms finality / 200M block gas**; the official docs we read say **300 ms / 600 ms / 150M**, and our own testnet measurement ≈ **318 ms/block**. We use the docs + measurement. | — |

> Implication: a ~0.3 s block + ~0.6 s finality makes a 9-second turn (choose → commit → auto-reveal → resolve) comfortable. The practical constraints are **read paths** (`getLogs` is 100 blocks) and **gas/reserve sizing**, not block speed.

## 2. System overview

```
 DESKTOP BROWSER                                   MONAD TESTNET
 ┌───────────────────────────┐   tx (commit/reveal)  ┌───────────────────────────────┐
 │ Game client               │──────────────────────►│ Cards · Armory · Arena · Ladder│
 │  • TS Engine (shared)     │◄── reads / subscribe ─│  Rulebook (season-pinned)      │
 │  • 2D view + The Table    │                       └───────────────▲───────────────┘
 │  • owner wallet (ext.)    │                                       │ events (WS subscribe)
 │  • session key (scoped)   │                              ┌────────┴────────┐
 └───────────┬───────────────┘                              │ Indexer (Node)  │ ← 100-block chunked backfill
             │ HTTPS                                        │ state + records │   or dedicated RPC
             ▼                                              └────────┬────────┘
 ┌───────────────────────────┐                                       │
 │ API: art/booking, moderation, matchmaking (blind), house-fighter bots, sparring │
 └───────────────────────────┘
```

## 3. Trust boundary (state it plainly in the pitch)
- Plaintext moves exist **only in the player's browser** until reveal. We never relay plaintext moves through a server.
- The **operator** can: pause new bouts, retire templates for *future* seasons, run matchmaking/bots. The operator **cannot**: alter a bout, write a card record, move a card, or touch escrow.
- A **session key** can only commit/reveal/open (never lock/transfer/approve/register). Authorisation is per owner (≤ 7 days), not per bout, so the worst case of a leaked key is that owner's bouts being forfeited until it expires or is revoked — keep session keys short-lived and fresh per session.
- Not claimed: protection from a player screenshotting their own screen, or from colluding players.

## 4. Commit–reveal rules (non-negotiable)
1. **Strict phases.** Turn *n* is fully revealed and resolved before commit window *n+1* opens. Never merge reveal-*n* into commit-*n+1* (the second committer would see the first's move).
2. **Commit** = `keccak256(abi.encode(chainId, arena, boutId, turn, player, action, salt))`.
3. **Salt recovery:** `salt = keccak256(sign_sessionKey(boutId, turn))` — deterministic, so a refresh rebuilds it. **Random in-memory salts are forbidden.**
4. **Timeouts:** per-phase deadlines; a missing commit or reveal = **forfeit** (loses any ante, takes a loss and scar). Both missing = bout voided. Anyone may call `claimTimeout`. **Losing must always beat not revealing.**
5. A reveal that doesn't match its commit = forfeit.
6. Domain separation (chainId + contract + bout + turn) prevents replay.
7. Pull-payments for any MON transfer; spoils transfers use internal `_transfer` after state is final.
8. **Auto mode:** once the first player reveals a playbook the second could compute the outcome and abort → forfeit must be at least as bad as a loss.

## 5. Security checklist (run the `building-secure-contracts` skills at checkpoint A2)
- Invariants: HP/Grit bounds; ante conservation (in = out + rake); card locked ⇔ in an active bout/pool; a card in at most one pool; records only writable by Arena.
- Fuzz the Solidity Engine against the TS reference with shared test vectors; invariant tests.
- No upgradeability for the event build; admin = pause + hard caps only; no admin path to bout or record state.
- Randomness: none in the base game (no `prevrandao`/VRF); Auto's `chance p%` derives from both players' salts (last-revealer abort covered by §4.4/§4.8).

## 6. Client architecture (desktop first)
| Concern | Decision |
|---|---|
| App | Desktop web app (React + Vite or Next — decide at kickoff). Min 1280×720, 16:9 / 16:10. |
| Renderer | **A layer, not the game:** state + shared TS engine + mock mode drive a **2D view from hour one**; The Table (R3F) renders the same state (`VISUAL_IMMERSION.md` §6). |
| Wallets | **Owner wallet = browser extension** (MetaMask/Rabby); **scoped session key** for in-bout txs, authorised once by the owner. Optional guest mode (burner + starter pool) for first-time players. |
| Key safety | Session key holds only gas; never cards (NFT_AND_CHAIN §3). |
| Chain libs | viem (+ wagmi if convenient). |
| State | Indexer API + WS push; **never rely on `getLogs` for state**; on-chain enumerable views (`cardsOf(owner)`, counters, `getRecord`). |
| Resilience | Auto-reconnect; deterministic salts make refresh safe; "Resume bout"; optimistic UI only for the user's own lock-in. |
| **Mock mode** | `?mock=1` runs the entire game against the local TS engine — essential for UI work, sparring, and the demo's Plan B. |
| Auto editor | Napkin table editor with live validation against the DSL schema. |

## 7. AI pipeline (non-blocking by design)
- **Portrait:** style-locked template → image model → background removal → halftone → (optional) depth map → pinned content-addressed. **Async**: the fighter is playable with a placeholder card while it renders. Never store a third-party generator URL on-chain (Promptmon did; it needed a CORS proxy).
- **Text (Booking, Chronicle draft, nickname/taunt):** short LLM calls with strict caps and caching; **moderation** (NSFW, IP, **real-person names/likeness**); templated fallback.
- **Cost guards:** per-address rate limits, one generation per mint, global daily budget; fallback gallery.
- **Keys** live server-side only.

## 8. Testing strategy
1. **Simulator (S0/S1)** — TS reference Engine + bots; gates the design (`CARD_DUEL.md` §7).
2. **Foundry:** unit + property/fuzz vs shared vectors + invariants.
3. **Client:** component tests (lock-in, resume), Playwright with two clients, mock-mode full bout.
4. **Perf spike:** The Table at 1080p on a laptop integrated GPU, once coding is allowed.

## 9. Open technical questions
- Does testnet expose `monadNewHeads` / `monadLogs`? (fallback: poll with ≤100-block ranges / `eth_subscribe newHeads`)
- Best dedicated testnet RPC provider and its limits?
- Is Multicall3 deployed on testnet (for batched drips / reads)?
- Re-measure Full's hidden-loadout gas and every per-function gas limit on Monad testnet (cold storage ~4× dearer than the EVM numbers in `contracts/gas-limits.json`; gas is charged on the limit).
- Indexer hosting for the event; backfill strategy within the 100-block cap.
