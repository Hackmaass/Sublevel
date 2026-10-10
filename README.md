# Monad Blitz Pune V3 — working title **SUBLEVEL**

*An underground fight-club card duel on Monad: write who your fighter is, pick how they fight, mint it as an NFT, and duel 1v1 with secret simultaneous moves — in a basement tabletop that remembers every fight.*

**Status:** design (draft v2) **+ first playable build.** Game only · desktop landscape first. Local sparring bouts work end-to-end; **on-chain (contracts, commit–reveal) is the next milestone.**

## Read in this order
| # | File | What it decides |
|---|---|---|
| 1 | [`docs/BRIEF.md`](docs/BRIEF.md) | The brief (verbatim) + constraint checklist C1–C8 |
| 2 | [`docs/VISION.md`](docs/VISION.md) | Lessons from the inspirations, pillars, the game in five sentences, why Monad (honestly) |
| 0 | [`docs/HOW_TO_PLAY.md`](docs/HOW_TO_PLAY.md) | **Player manual** (tables generated from the rulebook; also in-game via *How to play*) |
| 3 | [`docs/CARD_DUEL.md`](docs/CARD_DUEL.md) | **The game:** rules, Lite/Full, worked bout, balance requirements R1–R9, Live/Auto, identity prompts, abuse rules |
| 4 | [`docs/NFT_AND_CHAIN.md`](docs/NFT_AND_CHAIN.md) | Card model, contracts, session-key scope, bout lifecycle, why each piece is on-chain |
| 5 | [`docs/VISUAL_IMMERSION.md`](docs/VISUAL_IMMERSION.md) | **"The Table":** desktop-landscape layout, diegetic UI, WOW moments, art pipeline, palette/sound, lineage |
| 6 | [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) | Verified chain facts, trust boundary, commit–reveal rules, client & AI pipeline |
| 7 | [`docs/PLAN.md`](docs/PLAN.md) | Phases + exit criteria, first tasks (S0/S1), demo script, risks, cut list, decision log, open decisions |
| ref | [`docs/PROMPTMON_TAKEAWAYS.md`](docs/PROMPTMON_TAKEAWAYS.md) | What we adopt from Promptmon (evidence-backed), its mistakes, new ideas |

## Next step
**The depth gate has passed (Rulebook v1 frozen; R1 was restated — see `packages/engine/RULES.md` for the numbers and the one requirement we changed).** **M3 (Solidity) is built and tested — 63 Foundry tests:** Engine library checked against 1,541 shared vectors + 80 whole bouts (40 of them Full, with random hidden hands) replayed through the real contracts; Arena commit–reveal with timeouts; Full's hidden loadout (per-slot blinded hashes, openings on switch/trick/replacement, `OpenCards` pause); Cards (`isLegalBuild` at mint, on-chain `tokenURI`); Armory with scoped session keys; **Ladder: Elo rating + the soulbound-to-the-reign Belt, fed by a ranked queue (`Arena.joinRanked`)**. See `contracts/README.md` for the trust model and known limits. Deploying needs you to run `alchemy auth` (never share a private key). Open product decisions: `docs/PLAN.md` §8.

## Run it
```bash
pnpm install
pnpm engine:test            # rules tests (35)
pnpm --filter @sublevel/engine sim 400     # pacing / double-KO simulator
pnpm --filter @sublevel/engine tune        # format tuning sweep
pnpm web:demo               # PRODUCTION build on every network interface (port 3000): the venue mode — big screen shows a QR, phones scan it and read the fight
pnpm web:dev                # http://localhost:3000  → ENTER THE BASEMENT or QUICK FIGHT
# ?r=2d forces the flat renderer · ?q=low lowers 3D quality
```
Layout: `packages/engine` (pure TS rules + bots + simulator + test vectors + chain decoder) · `packages/chain` (viem client: commitments, wallet-signature secrets, `Seat`; tested against a local anvil) · `apps/web` (Next.js 16, React 19, R3F) · `contracts/` (Foundry: Engine · Cards · Armory · Arena) · `ASSETS.md` (licences).

**Also built (round 2):** interactive first fight (*LEARN TO FIGHT* on the title; auto-runs on first launch; scripted on the real engine, pinned by `packages/engine/test/tutorial.test.ts`) · post-bout *tape* (who out-read whom, one thing to change) · Ladder contract + ranked queue (UI/chain wiring still to do) · **THE ROOM** (Street Aura's idea, our way): spectators read the fight — see below.

**Milestones:** ✅ M1 engine + playable 2D bout · ✅ M2 *The Table* (3D, same state) · ✅ depth gate + Rulebook v1 + manual · ✅ M3 contracts (Foundry in `tools/`; not yet deployed) · ✅ Workbench (module builder: style · light + heavy · spread · name, saved locally) · ✅ chain decoder (`decodeState`/`decodeEvents`, round-trips all 1,541 vectors) · ✅ chain client library (`packages/chain`: a TypeScript client plays Lite and Full bouts through the real contracts on local anvil, incl. a simulated page refresh) · ⏳ M4 remainder: UI mode switch, indexer/events, testnet deploy (needs `alchemy auth`).
