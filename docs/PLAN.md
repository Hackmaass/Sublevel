# Build Plan

Status: **DRAFT v2, game only, desktop landscape first.** Implementation: **P1 (engine + simulator + depth gate) ✅ — Rulebook v1 frozen (R1 restated, see RULES.md); P3/P4 (2D view + The Table, local sparring) ✅; manual ✅. P2 (Solidity engine + Arena + Cards) is in progress**, chain wiring after. ⚑ = needs a decision from the user (§8).

## 1. Premise & unknowns

| Unknown | Why it matters | Default until answered |
|---|---|---|
| ⚑ **Event rules** — length, team size, may code be written **before** the day? | Blitz events *may* require code built on the day (**unverified**: the Ankara info pack is a JS-rendered Notion page we couldn't read). | One-day sprint (~8–10 h), small team; pre-work limited to design/assets/simulator. |
| ⚑ **Event theme / judging** | Search summaries of [Pune V2](https://luma.com/blitz-pune-july-2026) and [Mumbai V3](https://luma.com/blitz-mumbai-june-2026) say "The Agent Economy" theme and builder/audience voting. **No Pune V3 page found.** | Unknown theme. If agents are required, **Auto** mode becomes the headline. Ask first. |
| ⚑ Team size & skills | Parallel tracks. | 2–4: engine+contracts / client+renderer / art+audio+AI. |
| ⚑ AI vendors & budget | Portrait/moderation cost. | Fallback gallery covers all demo needs. |
| Real-money stakes | Legal sensitivity (India). | **None in public build** (points + testnet MON; Spoils opt-in, off). |

## 2. Strategy
Win on **the duel being fun in 15 seconds and the room looking unlike anything else**: a skill card-duel whose state is on-chain-verifiable, in an immersive tabletop world, where cards carry unforgeable careers. **Prove depth in a simulator before any contract or UI** (Promptmon decided its rules last and redeployed 3×). Keep Web3 where it is honestly necessary; protect the demo with mock mode, a fallback gallery and house fighters.

## 3. Phases & exit criteria

| Phase | Goal | Deliverables | Hard exit criterion |
|---|---|---|---|
| **P0 Align** (now) | Agree scope | These docs; §8 decisions | User signs off |
| **P1 Prove the duel** | Depth before code | **S0** complete rules spec → **S1** TS engine + bots + solver + tournament report | **R1–R9 pass** (`CARD_DUEL.md` §7) or the rules change and re-test |
| **P2 On-chain engine** | Trustworthy duel | `Engine` lib, `Arena` commit/reveal/timeouts, `Cards`, `Armory`, Foundry tests, shared vectors | Fuzz vs TS green; forfeit/timeout tests green; deployed to testnet |
| **P3 Play it (2D)** | Playable end to end | Client on the **2D view**: onboarding, hand-pick builder, Live Lite bout, mock mode, resume | Two browsers complete a Lite bout; mock mode completes one |
| **P4 The Table** | Immersion | R3F scene: W2 Slam, W3 Flip, W4 Hit; standees; light/sound | 60 fps at 1080p on a laptop iGPU (measured); Low tier = the 2D view |
| **P5 Identity** | Authorship | Booking → portrait pipeline, moderation, W1 Flash, Chronicle, house fighters | New user → fighter in < 60 s even with AI down |
| **P6 Depth modes** | Full + Auto | Full format (hidden loadout: **contracts built + tested**), Auto playbooks + napkin editor | R9 passes; a Full bout completes on testnet |
| **P7 Polish & rehearse** | Memorable | Press (W5), Napkin Fight (W6), sound pack, accessibility, 3 rehearsals | 3 clean runs on the venue-like network |
| **P8 Post-event** | Product | Ladder, seasons, Spoils, Marks, mobile portrait | per roadmap |

### 3.1 One-day sprint sketch (if code must be written on the day)
| Hours | Track A (engine+chain) | Track B (client) | Track C (art/audio/AI) |
|---|---|---|---|
| 0–1 | Port frozen rules to TS engine | **First code:** scaffold, 2D view, mock mode | Palette tokens, card + standee components |
| 1–3 | S1 tournament → freeze; Solidity `Engine` + `Arena` | Hand-pick builder, Lite bout UI | Starter gallery (20 fighters), SFX pack |
| 3–5 | Fuzz vs TS; deploy; wiring | Chain wiring, session key, resume | Booking pipeline + moderation |
| 5–7 | `Cards` records/scars + `tokenURI` | The Table renderer (W2–W4) | Impact frames, music |
| 7–9 | Full **or** Auto — *you asked for both; a one-day slice may not fit both, and which to cut is your call (⚑5)* | Polish, errors, Low tier | Press animation, pitch deck |
| 9–10 | Demo ×3 | | |
*(If pre-building is allowed, move P1–P3 before the event.)*

## 4. First tasks (ordered)
0. **S0 – Complete the rules spec** (paper, no code): every action vs every action; Dirty Trick effects; **double KO**; initiative/stumble (or drop them); Grit max/regen; Brace diminishing; module menu (3 styles × 6 attacks × 3 spreads) with numbers; Lite/Full parameters; Auto DSL grammar (lead choice, KO replacement, public-info-only conditions). The simulator and Solidity vectors are generated from this.
1. **S1 – Simulator & tournament** (no chain): R1–R9 report, pace levers tuned, frozen table.
2. **Shared test vectors** (JSON): `(state, actionA, actionB, rules) → state'` from the TS engine; Solidity must match 100%.
3. **Measure the network**: `monadNewHeads`/`monadLogs` support, dedicated testnet RPC limits, Multicall3, per-function gas limits (**gas is charged on the limit**) and the **reserve-balance** effect on session-key drips. (`getLogs` is already known: **100-block cap**.)
4. **Moderation + art pipeline spike** (no UI): style-locked prompt → cut-out → halftone → pinned; real-person filter.
5. Art kit: tokens, card + standee, 20-fighter gallery.

## 5. Demo script (draft; two judges fight each other, Lite, ~3 min)
| t | Beat | What the audience sees |
|---|---|---|
| 0:00 | **Cold open** | Dark basement, flickering tube, Ledger book; "Doors open." |
| 0:10 | **Booking** (pre-made for speed) | A judge's Polaroid mugshot develops; the three scrawled answers appear. |
| 0:30 | **Pool & lead** | Both pick a lead; tokens slapped; silence. |
| 0:45 | **Turns 1–3** | Slam → flip → hit; Grit matches burn down; announcer-free, pure tension. |
| 1:50 | **KO** | The Press re-prints the card with a scar; a Ledger line is stamped. |
| 2:10 | **Why the chain** | One slide, ~10 s: *commit-reveal referee, cards remember, nobody can edit history.* Ledger shows the real tx + block number on the explorer. |
| 2:30 | **Tamper test** | Try to change a revealed move → the contract refuses. |
| 2:45 | **Auto teaser** *(only if Auto is in the slice — see ⚑5)* | The napkin playbook plays a bout while we talk. |
Fallbacks: sparring bot in mock mode; house fighter if a judge declines; recorded tape.

## 6. Risk register

| ID | Risk | L/I | Mitigation | Fallback |
|---|---|---|---|---|
| R-DEPTH | Duel is solvable/boring/first-KO-decides | M/H | S1 gates R1–R9; pace levers | Fewer actions; Lite only |
| R-SCOPE | Too ambitious | H/H | Hard cut list (§7); renderer-as-layer | Ship 2D view |
| R-3D | The Table late / slow on laptops | M/H | Perf spike; tiers; 2D from hour one | Low tier is a polished 2D view |
| R-RPC | Public RPC limits/instability; `getLogs` 100 cap | H/M | Dedicated RPC; indexer fed by subscriptions; on-chain views | Mock mode; polling with ≤100-block ranges |
| R-WIFI | Venue Wi-Fi is bad during a live demo | H/M | Phone hotspot; tiny payloads; indexer + assets cached locally | Mock mode + recorded tape |
| R-GAS | Session-key reserve-balance reverts; gas-limit charging | M/M | Tight limits; sized drips; measure early | Larger drips; owner-wallet fallback |
| R-AI | Image/LLM slow or down | M/M | Async placeholder; gallery | Gallery only |
| R-MOD | Real-person/NSFW/IP content | M/H | Real-person filter, NSFW check, report flow | Gallery-only mode |
| R-ORIG | Looks like Buckshot Roulette/Inscryption/Promptmon/Street Aura | M/H | Cite lineage; avoid one-to-one maps (`VISUAL_IMMERSION.md` §12) | Re-skin |
| R-AUTO | Auto is solved by search / not unique | M/M | R9 test; blind matchmaking; unranked fallback | Cut Auto |
| R-KEY | Session-key leak | L/M | Scope = commit/reveal/open only; short per-session keys; `revokeSession` | Forfeits until expiry/revoke; never cards or records |
| R-ABUSE | Cherry-picking, wash fights, throwaway fighters | M/M | Blind ranked matchmaking; fees; rank rules (`CARD_DUEL.md` §10) | Disable ranked |
| R-LEGAL | Stakes/NFT transfers | M/H | None in public build | Remove Spoils |
| R-A11Y | Flashing/strobing | L/H | ≤ 3 flashes/s, reduce-motion | Static impact frames |
| R-IP | Film IP | L/M | No names/quotes/logos | Rename |

## 7. Cut list (in order)
1. Napkin Fight wide shot → highlight only · 2. Chronicle · 3. Press animation → static stamp · 4. Full format (keep Lite) ·
5. Auto *(items 4 and 5 are the user's explicit asks — order and whether to cut either is ⚑5)* · 6. Depth-map parallax → flat cut-out · 7. AI portraits → gallery only · 8. Module menu → presets only · 9. The Table → polished 2D view.
**Never cut:** commit–reveal on-chain · the shared TS engine + simulator · 2D view / mock mode · cards remember (records) · moderation.

## 8. Decisions
**Open ⚑:** (1) name · (2) event rules/theme · (3) The Table camera: side-on diorama vs over-the-shoulder · (4) two non-negotiable WOW moments · (5) in the one-day slice: **Full or Auto** (can't do both?) · (6) AI portraits live vs gallery for the demo.

**Decision log**
| # | Decision | Rejected | Reason |
|---|---|---|---|
| D1 | Genre: simultaneous-move card duel with public state | Real-time action via state channels; passive auto-battler (Promptmon); social deduction | Heavy / nothing to do / weaker fit |
| D2 | No randomness; pure mind-game | VRF/`prevrandao` | Removes a trust surface (Promptmon's was weak & cancelled out) |
| D3 | **Prompt changes art/identity only** (user) | Prompt-to-build/behaviour | Fairness, determinism |
| D4 | Owner wallet (extension) + scoped session key | Mobile-wallet-first | Desktop-first; frictionless turns |
| D5 | Game only — crowd layer parked (user) | Floor/projector/betting | Focus |
| D6 | No wagering; stakes off in public build | Betting, Spoils on | Legal |
| D7 | 2D photocopy-poster standees | 3D GLB creatures | Originality, cost, hides AI-art flaws |
| D8 | Lock-instead-of-escrow for cards | External escrow | Proven in Promptmon |
| D9 | Simulator before contracts | Contracts first | Depth is the largest unvalidated risk |
| D10 | Cards store module IDs; season-pinned Rulebook | Raw numbers on the card | Careers survive patches; no silent nerfs |
| D11 | **Hand-picked module menu ships in v1**; 12 curated templates are presets (user) | Templates only | Build diversity, simulatable |
| D12 | **Auto approved** as a controller mode over Lite/Full; hand-built playbooks (user) — reverses the earlier "no auto-battler" | No auto-battler | Async play; guarded by R9 + blind matchmaking |
| D13 | **Desktop landscape first** (user) | Mobile-first | Extension wallets, bigger render budget, keyboard play |
| D13b | **Visual concept: "The Table"**, side-on diorama camera — *proposed by me, pending ⚑3* | Ringside 3D; flat motion poster; over-the-shoulder view | Hidden-info card duel; AI portraits as standees |
| D14 | **Renderer is a layer** over engine+state; 2D view from hour one | 3D as the only UI | Protects the demo; parallel work |
| D15 | Public RPC `getLogs` capped at 100 → no state via `getLogs` | Log-based state | Verified on testnet; Promptmon hit it |

## 8b. M4 — chain wiring (checklist; M3 contracts are built and tested, nothing is deployed)
Order: (1) deploy → (2) client mode switch → (3) secrets → (4) decoder → (5) re-measure.
1. **Deploy** (user runs `alchemy auth` and creates an Agent Wallet session; we never handle a private key): CreateX deploy of Cards → Armory → Arena + `wire` (`contracts/script/Deploy.s.sol` shows the order), verify via the monskills verification API, faucet check.
2. **Client** — library DONE (`packages/chain`: `Seat`, hashes, secrets; 5 anvil end-to-end tests). Still to do: the UI mode switch, events/indexer, `eth_sendRawTransactionSync` on Monad, gas limits from `gas-limits.json`. (viem + `eth_sendRawTransactionSync`): the store keeps the mock/sparring mode as fallback; chain mode reads `getBout/getState/getHidden` and subscribes to events — **never `eth_getLogs` backfill** (100-block cap).
3. **Secrets must survive a page refresh — implemented and tested** (`deriveSecrets(signature)`; the anvil test rebuilds both seats from fresh signatures mid-bout and finishes the bout). Rationale: Full needs **6 secrets per bout** (lead salt + 5 slot salts) plus per-phase commit salts. If they live only in memory or in a session key, a refresh = a forfeit. Derive them deterministically from an **owner-wallet signature over `(chainId, arena, boutId, side)`** (e.g. `personal_sign` once per bout, then HKDF per purpose/slot/turn). Never from public values (the test harness's `keccak("salt", id, ...)` is for tests only). Session keys only carry the ability to send txs, not the secrets.
4. **Decoder/renderer must accept the new on-chain values** — the engine side is DONE (`decodeState` → `ChainView{state, paused, unopened, unopenedTricks}`, `decodeEvents`, `unpackHex`; tested against every vector); the renderer/UI side is still to do (`apps/web`):
   - packed `phase = 3` (OpenCards pause), fighter `maxHp = 0` placeholders, trick id `255` (guard every `TRICKS[id]` / `SPREADS[spread]` lookup);
   - `TurnResolved` with a mid-turn state followed by `TurnConcluded`, and `CardOpened` events;
   - a UI state for the pause ("show your bench") with the deadline.
5. **Re-measure on Monad testnet:** every gas figure in `contracts/gas-limits.json` (EVM-priced today; cold storage ~4× dearer), 1-tx-per-3-blocks behaviour for sub-10-MON session keys, Arena size (36.5 KB, fine under Monad's 128 KB).

## 9. Advisor checkpoints
| # | When | Status |
|---|---|---|
| A0 | After reference research | ✅ |
| A1 | Concept & scope (several rounds: depth, commit-reveal, NFT/chain, prompts, visuals) | ✅ |
| A2 | Before contract design (threat model, invariants) | ⏳ |
| A3 | After S1 results (is the duel deep?) | ⏳ |
| A4 | Stuck (2 failed attempts) | on demand |
| A5 | Before demo (cut list, failure rehearsal) | ⏳ |
| A6 | "Done" claim | ⏳ |
Rules: orient then ask; make work durable first; the advisor isn't an oracle — resolve conflicts in a follow-up call; every plan item traces to the brief (`BRIEF.md` C1–C8) or an approved decision; verify chain facts from docs/RPC.
