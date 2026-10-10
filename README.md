# SUBLEVEL

**An underground fight-club card duel on Monad.** Every move is secret until both fighters have sealed it, then a contract resolves the turn. Fighters are NFTs with careers nobody can edit. A room of spectators reads the fight live from their phones without ever touching the result.

Built at **Monad Blitz Pune V3**.

## Links

| | |
|---|---|
| **Live app** | _filled in after the Vercel deploy_ |
| **Repo** | https://github.com/Hackmaass/Sublevel |
| **Network** | Monad Testnet (chain `10143`) · explorer https://testnet.monadscan.com |
| **Contracts** | _filled in after the testnet deploy — see the table below_ |

### Deployed contracts (Monad Testnet)

| Contract | Address | Role |
|---|---|---|
| Arena | _pending deploy_ | commit → reveal bouts, timeouts, forfeits, settlement |
| Cards | _pending deploy_ | ERC-721 fighters and tricks; records written only by the Arena |
| Armory | _pending deploy_ | pools of cards, scoped session keys |
| Ladder | _pending deploy_ | Elo ratings + the Belt (soulbound to the reign) |
| Bootstrap | _pending deploy_ | deployed all four above in one transaction, then holds no power |

Source verification: `pnpm --filter @sublevel/chain verify <bootstrapAddress>` (uses the Monad verification API; details below).

## Try it in one minute

1. Open the live app and press **LEARN TO FIGHT**. It's a six-turn scripted bout that teaches the whole game, offline.
2. Press **QUICK FIGHT** to spar against the house bot, then open **THE TAPE** on the result screen to see who out-read whom.
3. Press **⛓ ON-CHAIN DUEL**. A guest wallet (a throw-away key in your browser, no extension needed) signs every move; send it a little testnet MON from [the faucet](https://faucet.monad.xyz) and press **START THE DUEL**. Every seal and every reveal is a real transaction on Monad, listed in **THE LEDGER** with its block and how fast it landed. The contract and the TypeScript engine must agree on every turn; the Ledger shows `chain = engine ✓`.
4. **Spectators:** open `/watch` in a second window to read the fight (the venue QR needs the local server — see *Venue mode*).

## What is built, and what is not

**Built and working**
- **Rules engine** (`packages/engine`): pure TypeScript, integer-only, Rulebook v1 (guard triangle, Grit, three styles, switches, one-shot tricks), bots, a simulator and the "depth gate" that decided the rules. 54 tests, 1,541 cross-language vectors.
- **Contracts** (`contracts/`): `Engine` (a line-for-line port of the TS rules), `Arena` (commit–reveal for Lite and Full hidden-hand bouts), `Cards`, `Armory`, `Ladder`. 63 Foundry tests, including whole bouts replayed through the contracts against the TypeScript engine.
- **The Table** (`apps/web`): a 3D basement tabletop with a flat fallback, a learn-to-fight tutorial, a post-bout tape with a takeaway, and the on-chain duel above.
- **The Room**: spectators predict each fighter's next move kind; picks are sealed and revealed one turn late, scored for points only, and can never affect a bout. A phone view (`/watch`) works two ways: in a second window of the same browser, and — in venue mode — from real phones by scanning a QR code on the projector.

**Not built / not live (so nothing here is claimed as working)**
- The on-chain duel plays the **Lite** format vs a house bot. The Full format (3v3, hidden hands) is implemented and tested in the contracts but not wired into the UI.
- **Ranked queue and the Belt** are implemented and tested in the contracts (`Ladder`, `Arena.joinRanked`); there is no UI for them yet.
- **Auto playbooks**, AI-generated portraits (portraits are procedural), a mainnet deployment and an audit.
- The Room's scoring is **off-chain** (a mock referee on the host). An on-chain `Crowd` contract is designed but not written; alt wallets could farm it, so only points and cosmetics would ever be at stake.

## Run it yourself

Needs Node 20+ and pnpm. **Foundry is not needed to run the app.**

```bash
git clone https://github.com/Hackmaass/Sublevel.git && cd Sublevel
pnpm install
pnpm web:dev                      # http://localhost:3000  (LEARN TO FIGHT, QUICK FIGHT work offline)
pnpm engine:test                  # rules engine tests
```

**Contracts** (needs [Foundry](https://getfoundry.sh); `forge-std` and OpenZeppelin are vendored in `contracts/lib`):
```bash
cd contracts && forge test        # 63 tests
```

**Deploy your own copy to Monad Testnet** (no CLI, no key leaves your wallet): run the app, open **`/deploy`**, connect MetaMask, and send the single deployment transaction (about 17.7M gas; on Monad you pay the gas *limit*, roughly 2 MON at the 100 gwei minimum fee). Put the printed addresses into `apps/web/src/lib/deployments.ts` and the on-chain duel appears on the title screen. To publish the source on the explorers: `pnpm --filter @sublevel/chain verify <bootstrapAddress>`.

**Venue mode** (a projector + phones): `pnpm web:demo` serves a production build on every network interface. Open `http://localhost:3000` on the big screen; it shows a QR code that points at your machine's network address plus a four-letter room code, and phones that scan it join the Room. Phones must be able to reach the laptop (same wifi, or the laptop's hotspot); the relay keeps its rooms in one server process, so it is switched off in the hosted build.

## Why Monad (honestly)

Commit–reveal, NFTs and escrow work on any EVM chain. What Monad changes is that a **per-turn on-chain mind-game can feel real-time**: ~0.3–0.4 s blocks and sub-second finality make "seal, wait for the other seal, reveal, resolve" a few seconds per turn instead of a minute, and gas is cheap enough for a few dozen transactions per bout. Monad also charges the gas *limit*, so the client estimates tightly per call, and a wallet under 10 MON gets one transaction per ~3 blocks, so the client spaces its own transactions. Those two rules are built into `packages/chain/src/duel.ts`. Verified chain facts (and where each came from) are in [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) §1.

## How it fits together

```
 browser (Next.js)                                   Monad testnet
 ┌──────────────────────────────┐   seal / reveal   ┌───────────────────────────────┐
 │ The Table (R3F + flat 2D)    │──────────────────►│ Arena  ◄── Engine (rules)     │
 │ engine (TS rules, bots)      │◄──── state ───────│ Cards (ERC-721, records)      │
 │ guest wallet + house bot     │                   │ Armory (pools, session keys)  │
 │ THE LEDGER (tx, block, ms)   │                   │ Ladder (Elo, the Belt)        │
 └─────────────┬────────────────┘                   └───────────────────────────────┘
               │ QR + SSE (venue mode, off-chain)
               ▼
        spectator phones  (/watch): read the fight, points only
```

- **Fairness:** a commit is `keccak(chain, arena, bout, turn, phase tag, player, choice, salt)`. A bad reveal forfeits; a missed deadline forfeits; both missing voids the bout. There is no randomness and no custody of funds. After deployment nobody holds any power: `Bootstrap` wires everything inside its own constructor.
- **The chain is the authority.** The UI narrates each turn with the TypeScript engine, then compares the result to the contract's state; a disagreement would be flagged on screen.
- Full trust model and known limits: [`contracts/README.md`](contracts/README.md).

## Market and revenue (an honest sketch)

- **Who it's for:** crypto-native communities and events that want a live, watchable game in the room (hackathons, meetups, Discord and college communities), and card-duel players who want provable fairness and a permanent record.
- **What would earn:** (1) **event licensing** of The Room: a host runs a projector night and the community plays; (2) **cosmetics and card art** (the fight-club look is the product), never power; (3) a **small mint fee** for custom fighters; (4) sponsored belts and seasons. No betting and no pay-to-win: the design pillars forbid both, and wagering is a legal risk in India.
- **What we have not proven:** any of this. There are no users yet.

## Repository map and design docs

`packages/engine` (rules, bots, simulator, tests) · `packages/chain` (viem client: commitments, secrets, `Seat`, `Actor`, duel flow, verify script) · `apps/web` (Next.js 16, React 19, R3F) · `contracts/` (Foundry) · `docs/` · `ASSETS.md` (every external asset and its licence).

| File | What it decides |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | The brief + constraint checklist |
| [`docs/VISION.md`](docs/VISION.md) | Pillars, the game in five sentences, why Monad, the Room |
| [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) | Player manual (tables generated from the rulebook) |
| [`docs/CARD_DUEL.md`](docs/CARD_DUEL.md) | The rules, Lite/Full, balance requirements, abuse rules |
| [`docs/NFT_AND_CHAIN.md`](docs/NFT_AND_CHAIN.md) | Card model, contracts, session keys, bout lifecycle |
| [`docs/VISUAL_IMMERSION.md`](docs/VISUAL_IMMERSION.md) | "The Table": layout, diegetic UI, art pipeline |
| [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) | Verified chain facts, trust boundary, commit–reveal rules |
| [`docs/PLAN.md`](docs/PLAN.md) | Phases, risks, cut list, decision log |
| [`docs/screenshots/`](docs/screenshots/) | What every feature looks like |

**Credits:** inspired by the *spirit* of Promptmon (authorship and stakes) and Street Aura (a live, shared, block-driven room); no designs or code were copied. The fight-club aesthetic uses no film IP.
