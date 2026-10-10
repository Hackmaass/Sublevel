# Vision — working title **SUBLEVEL** (provisional)

> An underground fight-club card duel on Monad. Write who your fighter is, pick how they fight, mint it as an NFT, and duel 1v1 with secret simultaneous moves — in a basement that remembers every fight.

Status: **DRAFT v2 — game only, desktop landscape first.** Brief and constraint checklist: `BRIEF.md`.

## 1. What we learned from the inspirations (principles, not features to copy)

| Source | Why it works | Where it is weak (our opening) |
|---|---|---|
| **Promptmon** | **Authorship + stakes**: you made it with words, own it, and can lose it. | The fight is passive and (as coded) deterministic from stats; rules were decided last (redeployed 3×); README drifted. See `PROMPTMON_TAKEAWAYS.md`. |
| **Street Aura** | **A live, shared, block-driven spectacle**, session keys + faucet for zero-friction txs, mock backend. | Outcome driven by spend/spam, little persistence. (Its crowd layer is parked; the *frictionless-tx* and *mock-mode* ideas remain useful.) (Analysis notes kept private.) |
| **Both** | A one-sentence premise; a clippable moment. | No skill ceiling, scouting, or reason to improve. |

**Our wedge:** Promptmon's *authorship and stakes* + a real **skill/mind-game with a public, permanent record** — so there is a meta, rivalries and a reason to return.

## 2. Pillars
| Pillar | Meaning | Anti-pillar |
|---|---|---|
| **P1 Mind over money** | Decisions beat spending; mechanics are open and balanced. | Pay-to-win, spam-to-win, god prompts. |
| **P2 History is the asset** | The card is a *career*: record and scars are earned and unforgeable. | Static JPEGs. |
| **P3 Place, not menus** | An immersive tabletop basement; information lives in objects (with a clear overlay). | Generic neon-crypto UI. |
| **P4 Zero-friction, real stakes out** | Playing within ~15 s (desktop: extension wallet + session key); stakes optional. | Wallet-popup hell; forced betting. |
| **P5 Fairness you can verify** | Commit–reveal, immutable season rulebook, open engine. | "Trust the operator." |

## 3. The game in five sentences
1. You make a **fighter**: a 3-question *Booking* gives it identity and a style-locked portrait; its **abilities come from hand-picked modules** (a prompt never changes them).
2. A bout is a **secret simultaneous-move card duel** — Lite (~60–90 s, first KO) or Full (~3 min, 3v3 with a Corner) — playable **Live** or, via a hand-built **playbook**, **Auto**.
3. Moves are **committed then revealed on-chain**, so there's no referee to bribe and no randomness to game.
4. The card **remembers**: record, scars, wear — written only by the Arena contract.
5. The whole thing is staged as **The Table**: a basement tabletop with standees, matchsticks and a ledger book that *is* the chain.

## 4. Why Monad (honest)
Commit-reveal, NFTs and escrow work on any EVM chain. Monad's real contribution is making a **per-turn on-chain mind-game feel real-time** (docs: 300 ms slots, 600 ms full finality; measured testnet ≈ 318 ms/block), with gas cheap enough for ~12–32 txs per bout. Details → `TECH_ARCHITECTURE.md` §1. Don't claim fairness/NFTs/randomness are unique to Monad.

## 5. Naming & IP
Genre aesthetic (basement club, photocopied posters, tape) is fair game; **no** use of the film's title, characters, quotes or logos. Alternates: **BASEMENT RULES · THE PIT 10143 · CLUB 10143 · NO SPECTATORS.** Violence is stylised, never gory.

## 5b. The Room (unparked 2026-10-10)
Street Aura's lesson — a live, shared, block-driven room — taken without its flaws. **The room reads the fight:** each turn spectators lock a prediction of what *kind* of move each fighter will play (LIGHT / HEAVY / BRACE / SWITCH / TRICK) and score points for correct reads; the projector shows the room's heat, revealed one turn late, and a roar when most of the room called it. **Spectators can never affect a bout**, only points and cosmetics are at stake, and the fighters never see the crowd's call (predictions are sealed, commit–reveal). Pure logic: `packages/engine/src/crowd.ts`. Mock backend + projector + phone view (`/watch`) are built; the on-chain `Crowd` contract and live phones come after the live bout (M4). Known limits: alt wallets can predict perfectly (so nothing of value rides on it); in mock mode a "phone" is a window of the same browser.

## 6. Parked (not deleted)
Rule votes, Call-Up, pari-mutuel betting, Spoils in the public build, mobile portrait layout, Full-3D "Ringside", English→playbook compile, Marks (card progression by choice).
