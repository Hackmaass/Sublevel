# SUBLEVEL

### An underground fight-club card duel on Monad.

Two fighters seal a move at the same moment. Nobody can see the other's, nobody can change theirs, and a contract resolves the turn. Fighters are NFTs whose careers nobody can edit, and a whole room can read the fight live from their phones without ever touching the result.

Built at **Monad Blitz Pune V3**.

![The title screen, with the spectator QR code](docs/screenshots/05-venue-relay-qr/01-title-with-qr.png)

## Links

| | |
|---|---|
| **Live app** | _to be added after the hosted deploy_ |
| **Repository** | https://github.com/Hackmaass/Sublevel |
| **Network** | Monad Testnet (chain id `10143`) |
| **Contracts** | _addresses to be added after the testnet deploy (table below)_ |

### Deployed contracts (Monad Testnet)

| Contract | Address | Role |
|---|---|---|
| Arena | _to be added_ | commit → reveal bouts, timeouts, forfeits, settlement |
| Cards | _to be added_ | ERC-721 fighters and tricks; records written only by the Arena |
| Armory | _to be added_ | pools of cards, scoped session keys |
| Ladder | _to be added_ | Elo ratings and the Belt (soulbound to the reign) |
| Bootstrap | _to be added_ | deployed the four above in one transaction, then holds no power |

## The game in a minute

**A turn.** Both fighters secretly choose one action, lock it in, and then both are revealed at once and resolved.

| Action | What it does |
|---|---|
| **Attack** | Spend Grit to hit. Each fighter carries one **LIGHT** attack (cost 1–2) and one **HEAVY** attack (cost 3+). |
| **Brace** | A guard that gains Grit. |
| **Switch** | Swap in the fighter from your Corner (free if the other side didn't attack). |
| **Dirty Trick** | A one-shot card: heal, steal Grit, a cheap shot. |

**The triangle that makes it a mind-game:** **Brace beats LIGHT · HEAVY beats Brace · LIGHT beats HEAVY.** On top of that, fighters have styles: **BRAWL beats CLINCH beats SLICK beats BRAWL**. Everyone earns +1 Grit a turn (capped at 5), so spending a lot now means being empty next turn. A bout (Lite) is two fighters and a trick each, and the first KO wins, in about a minute.

Predictable players lose, so you have to read the other side: their Grit, their last move, whether they're turtling or about to go heavy.

| Learn to fight (scripted, six turns) | The tape: who read whom |
|---|---|
| ![A lesson on the 3D table](docs/screenshots/01-tutorial/lesson1-3d-table.png) | ![The post-bout tape](docs/screenshots/02-tape/the-tape.png) |

## Why it's on-chain (what breaks if this were a database?)

- **A referee nobody has to trust.** Commit–reveal means neither player can see or change a move after sealing, and the contract resolves it. There is no server that could peek at your move or favour a side.
- **Careers nobody can edit.** A card's wins, losses and scars are written only by the Arena, from a finished bout. There is no admin who can rewrite a record.
- **A title nobody can quietly reassign.** The Belt moves only when the holder loses a ranked bout.
- **No randomness and no custody.** There's no random number to game and no money held by the contracts.

## The ON-CHAIN DUEL

Press **⛓ ON-CHAIN DUEL** on the title screen. A **guest wallet** (a throw-away key generated in your browser) signs every move, so there are no wallet popups and you don't need a wallet of your own. The opponent is the house bot with its own wallet. Fund the guest wallet once from the faucet and press start.

Every seal and every reveal is a real transaction on Monad. **The Ledger** lists each one: who sent it, what it was, which block, and how many milliseconds it took to land. The UI narrates each turn with the TypeScript rules engine, then compares the result with the state the **contract** holds, and flags any difference. The Ledger shows `chain = engine ✓` while they agree.

![The match with the Ledger](docs/screenshots/07-onchain-duel/06-turn-resolved-ledger-growing.png)

*(Screenshot taken on a local test chain; testnet captures are added after the deploy.)*

## The Room

Street Aura's lesson, our way: the crowd takes part in the show but never in the result.

Spectators predict what **kind** of move each fighter will play next (LIGHT, HEAVY, BRACE, SWITCH or TRICK) and score points for correct reads. Picks are **sealed** while the turn is being decided, so the fighters can't use the crowd as a hint, and they're **revealed one turn late**, then scored. The big screen shows the room's read as heat bars and a roar when most of the room called it. Only points and cosmetics are ever at stake.

| The big screen | A spectator's phone |
|---|---|
| ![The room's read, revealed one turn late](docs/screenshots/03-room-projector/heat-revealed-3d.png) | ![The phone view](docs/screenshots/04-room-phone/phone-after-turn.png) |

**Venue mode:** `pnpm web:demo` shows a QR code on the projector. Phones on the same network scan it, pick a name and join. No wallet needed.

## Try it in one minute

1. Open the live app and press **LEARN TO FIGHT**: a six-turn scripted bout on the real engine, fully offline.
2. Press **QUICK FIGHT** to spar the house bot, then open **THE TAPE** on the result screen.
3. Press **⛓ ON-CHAIN DUEL**, fund the guest wallet from [the faucet](https://faucet.monad.xyz) and press **START THE DUEL**.
4. Open **`/watch`** in a second window to read the fight as a spectator.

## What is built, and what is not

**Built and working**
- **Rules engine** (`packages/engine`): pure TypeScript, integer-only, Rulebook v1; bots, a simulator and the "depth gate" that picked the rules. 54 tests and 1,541 cross-language vectors.
- **Contracts** (`contracts/`): `Engine` (a line-for-line port of the TS rules), `Arena` (commit–reveal for Lite and Full hidden-hand bouts), `Cards`, `Armory`, `Ladder`. 63 Foundry tests, including whole bouts replayed through the contracts and checked against the TypeScript engine.
- **The web app** (`apps/web`): the 3D tabletop with a flat fallback, the learn-to-fight tutorial, the post-bout tape, the Room (host screen and phones), the one-transaction **deploy page**, and the on-chain duel with its Ledger.
- **Tooling**: a client library that plays full bouts through the contracts (`packages/chain`), tested on a local chain; a script that publishes source for all five contracts through the Monad verification API.

**Not built / not live (nothing here is claimed as working)**
- The on-chain duel plays the **Lite** format against a house bot. The Full format (3v3, hidden hands) is implemented and tested in the contracts but isn't wired into the UI.
- The **ranked queue and the Belt** are implemented and tested in the contracts; there is no UI for them yet.
- The Room's scoring runs **off-chain** in the host browser (a mock referee). An on-chain `Crowd` contract is designed but not written.
- **Auto playbooks**, AI-generated portraits (portraits are procedural), a mainnet deployment, and an audit.

## Run it yourself

Needs Node 20+ and pnpm. **Foundry is not needed to run the app.**

```bash
git clone https://github.com/Hackmaass/Sublevel.git && cd Sublevel
pnpm install
pnpm web:dev                      # http://localhost:3000 (the tutorial and sparring work offline)
pnpm engine:test                  # rules engine tests
```

**Contracts** (needs [Foundry](https://getfoundry.sh); `forge-std` and OpenZeppelin are vendored in `contracts/lib`):
```bash
cd contracts && forge test        # 63 tests
```

**Deploy your own copy to Monad Testnet** (no CLI, and no key leaves your wallet): open **`/deploy`** in the running app, connect MetaMask and send the single deployment transaction. It costs about 17.7M gas; Monad charges the gas *limit*, so at the 100 gwei minimum fee that's roughly 2 MON. The page prints the five addresses. Put them into `apps/web/src/lib/deployments.ts` and the on-chain duel appears on the title screen.

**Publish the source on the explorers:** `pnpm --filter @sublevel/chain verify <bootstrapAddress>` (it reads the other four addresses from the Bootstrap contract and uses the exact compiler settings of the build).

**Venue mode** (a projector and phones): `pnpm web:demo` serves a production build on every network interface. Open `http://localhost:3000` on the big screen and phones that scan its QR join the Room. The phones must be able to reach the laptop (same wifi, or the laptop's hotspot). The relay keeps its rooms in one server process, so it is switched off in hosted builds.

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
        spectator phones (/watch): read the fight, points only
```

**Fairness.** A commit is `keccak(chain, arena, bout, turn, phase tag, player, choice, salt)`. A reveal that doesn't match, or isn't legal, forfeits; a missed deadline forfeits; both sides missing voids the bout. After deployment nobody holds any power: `Bootstrap` wires everything inside its own constructor. The full trust model and known limits are in [`contracts/README.md`](contracts/README.md).

## Why Monad

Commit–reveal, NFTs and escrow work on any EVM chain. What Monad changes is that a **per-turn on-chain mind-game can feel real-time**: ~0.3–0.4 s blocks and sub-second finality turn "seal, wait for the other seal, reveal, resolve" into a few seconds per turn instead of a minute, and gas is cheap enough for a few dozen transactions per bout. Two Monad rules shaped the client, and both are handled in `packages/chain/src/duel.ts`:

- **Gas is charged on the limit, not on what's used,** so each call estimates its own gas with only a small buffer.
- **A wallet under 10 MON gets one transaction per ~3 blocks,** so the client spaces its own transactions.

The verified chain facts, and where each one came from, are in [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md).

## Market and revenue (an honest sketch)

- **Who it's for:** crypto-native communities and events that want a live, watchable game in the room (hackathons, meetups, campus and Discord communities), and card-duel players who want provable fairness and a permanent record.
- **What could earn:** event licensing of the Room (a host runs a projector night and the community plays); cosmetics and card art, never power; a small mint fee for custom fighters; sponsored belts and seasons. No betting and no pay-to-win. The design pillars forbid both, and wagering is a legal risk in India.
- **What we have not proven:** any of this. There are no users yet.

## Repository map and design docs

`packages/engine` (rules, bots, simulator, tests) · `packages/chain` (viem client: commitments, secrets, seats, duel flow, verify script) · `apps/web` (Next.js 16, React 19, React Three Fiber) · `contracts/` (Foundry) · `docs/` · `ASSETS.md` (every external asset and its licence).

| File | What it covers |
|---|---|
| [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) | The player manual (tables generated from the rulebook) |
| [`docs/CARD_DUEL.md`](docs/CARD_DUEL.md) | The rules, Lite and Full formats, balance requirements, abuse rules |
| [`docs/NFT_AND_CHAIN.md`](docs/NFT_AND_CHAIN.md) | Card model, contracts, session keys, bout lifecycle |
| [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) | Verified chain facts, trust boundary, commit–reveal rules |
| [`docs/VISION.md`](docs/VISION.md) | Pillars, the game in five sentences, why Monad, the Room |
| [`docs/VISUAL_IMMERSION.md`](docs/VISUAL_IMMERSION.md) | "The Table": layout, diegetic UI, art pipeline |
| [`docs/PLAN.md`](docs/PLAN.md) | Phases, risks, cut list, decision log |
| [`docs/screenshots/`](docs/screenshots/) | What every feature looks like |

**Credits.** Inspired by the *spirit* of Promptmon (authorship and stakes) and Street Aura (a live, shared, block-driven room); no designs or code were copied. The fight-club aesthetic uses no film IP.
