# What we take from Promptmon — brainstorm v0 (for discussion)

Status: DISCUSSION DRAFT. Evidence is from the Promptmon repo at HEAD `06949e5` (files named per item). Scope: the **1v1 card duel**
(`CARD_DUEL.md`, `NFT_AND_CHAIN.md`); crowd layer parked.

## 1. What Promptmon actually is (beyond its README)
A ticketed team build (`PRO-xx` commit prefixes, "epics", numbered **WOW moments**) that shipped, in this order: contracts →
Tripo pipeline → mint flow → pre-generated roster → arena of open challenges → on-chain leaderboard → cinematic battle → polish
(bloom, SFX, siren) → UX overhauls.

> **Biggest lesson (from `git log` order): the game rules were decided last.** Both rule-changing redeploys — *"mint pagable 0.1 MON +
> stats elegidas"* and *"puntos al subir de nivel para asignar a mano"* — landed **after** the cinematic battle, the polish pass and the
> Vercel fixes, followed by an address-fix commit. The mUSDC → MON → level-up-points history means the rules were still moving in the
> final stretch, after the visuals were built, and the README never caught up. **This is the case for S0/S1 (rules + simulator) before any
> contract or UI.**

## 2. Ideas to adopt (with evidence and how we'd change them)

| # | Promptmon fact (evidence) | Take | Our version |
|---|---|---|---|
| T1 | **Authorship is the hook.** Prompt → creature → "WOW #1 birth animation" (`PRO-17`, `spawnAnimation.ts`); real-progress loader with narrated phases (`GenerationLoader.tsx`: "Analyzing → Sculpting → Texturing → Being born") | Make creation a *ritual*, not a form | **The Booking:** 3 short questions (name / what did they do / last words) instead of one prompt → richer identity, nickname, taunt and art. Photocopier-darkroom narration ("Developing the print… Pressing the card…") and a **card-birth reveal**. |
| T2 | **Prompt = aesthetics only**, validated by one shared pure function on client **and** server (`validatePrompt.ts`) | Keep exactly | Same rule; add moderation (NSFW/IP) and length caps; stats never come from text. |
| T3 | **Pre-generated roster as the demo safety net** (`roster.ts`, `tripo/mint-roster.ts`, `public/roster`) | Keep | **House fighters:** ~10 pre-minted opponents that fill empty lobbies and rescue the demo if AI/network fails. **Rules (advisor):** (a) their career records must be **real** — bot-operated accounts play through `Arena` on-chain, *never* admin-written, or "nobody can edit history" is false; (b) bouts vs house fighters are **unranked** (otherwise an on-chain rating farm); (c) this is **different from Sparring**, which is off-chain, uses the same TS engine, and writes nothing. |
| T4 | **Lock instead of escrow** (`locked`, `_update` override) | Keep | Already in `Cards`/`Armory`. |
| T5 | **Winner-takes-the-NFT** as the dramatic stake; "WOW #2 conquest animation" (`PRO-23`) | Keep the drama, soften the risk | **Spoils** stays opt-in and off in the public build. The every-bout equivalent is the **Scar Press** — a ritual where the card is re-printed with its new mark. **Stakes trade-off to decide:** Promptmon's engine is *author it → get attached → can lose it forever*. With Spoils off, ours becomes *you can't lose the card, but you can never erase a loss* (the permanent record + scars). Is that enough? |
| T6 | **Level-up points the owner allocates** (`allocate()`, added in the v4 redeploy) — progression with agency. *(We have no evidence players asked for it; it was a late team choice.)* | Valuable, risky | See §3 (Marks) — it needs a design decision before we copy it. |
| T11 | **A battle resolves in one tx, so a challenge can sit open until anyone accepts** (`createChallenge` / `acceptChallenge`) — nobody has to be online together | Inspiration for async play | The seed of our **Correspondence** mode (NFT_AND_CHAIN §6.2): commit–reveal is also asynchronous, with turn deadlines in hours. |
| T7 | **Battle "juice"**: lunges, volleys, camera shake with decay, explosions, bloom, siren (`BattleCinematic.tsx`, `battle.ts`, `sfx.ts`) | Keep the philosophy: every hit must be *felt* | 2D equivalent: hit-stop, impact frames, screen shake with decay, stencil damage numbers, a distinct sound per action. |
| T8 | **Real-time leaderboard from contract events** (`useLeaderboard.ts`, `useWatchContractEvent`) | Keep | Ladder + "Hall of Fame" from `Arena` events, with polling fallback. |
| T9 | **Open challenges board** | Keep, bound it | Challenge board **plus challenge-by-link**; bounded/paginated reads (Promptmon's `getOpenChallenges` loops over everything). |
| T10 | Small, frequent PRs and clear per-ticket scope | Process | Same: S0/S1 → engine → client → chain → polish, each with exit criteria (PLAN §3). |

## 3. Decision: progression with agency ("Marks")
Promptmon added `allocate()` after launch — a sign that players want to *shape* a winner. We froze card mechanics (template IDs) to
protect balance and careers. Options:

| Option | What it is | Pro | Con |
|---|---|---|---|
| **M0** No progression | Record + cosmetic scars only | Simple, balanced | Wins feel cosmetic |
| **M1 Marks (post-event)** | At milestones (e.g. 3, 10, 25 wins) the owner picks **1 of 2 sidegrade Marks** — each a small trade-off (e.g. *Broken Hand: Heavy +1 dmg, Jab −1 dmg*) | Agency, identity, scouting depth ("what did they pick?") | Grind advantage; balance surface grows; must be simulated |
| **M2** Free stat allocation (Promptmon v4) | Points spent on stats | Familiar | Pay/grind-to-win; breaks equal-power templates |

**Recommendation: M0 for the demo and v1.** Store **mark slots as Rulebook IDs on the card now** so M1 can arrive after the event without a
migration, and Marks survive patches the way templates do. M1 multiplies the space the simulator must cover.

Guardrails for M1: Marks are **sidegrades only**, capped at 2–3 per card, **declared in the public pool** (so opponents see them), and
Lite/Full "Standard" ladders can disable them.

## 4. Lessons / anti-patterns (things Promptmon got hurt by)

| # | Evidence | Lesson for us |
|---|---|---|
| L1 | `Creature.glb` stores the **raw Tripo URL on-chain**; the team had to add `/api/model` (CORS proxy, PR #21) and a static roster because generator URLs/CORS are fragile | **Never store a third-party generator URL.** At mint, fetch the image, **pin it content-addressed**, store the hash. |
| L2 | Commit `9774cc3`, body: *"El RPC público de Monad limita eth_getLogs a 100 bloques, así que la query de 'Tus criaturas' fallaba entera y la arena mostraba vacío."* **We re-tested it on testnet today: `eth_getLogs is limited to a 100 range` (error -32614)** — 100 blocks ≈ 32 s of history at ~0.32 s/block. | **Design rule:** never depend on `getLogs` for state. Keep **enumerable on-chain views** (`cardsOf(owner)`, counters, `getRecord`), maintain our own indexer fed by live subscriptions, and use **100-block chunked backfill** (or a dedicated RPC) for history. (Street Aura's bundle chunks its backfill for the same reason.) |
| L3 | Contract **redeployed 3×**; README, DEPLOY.md and addresses drifted; a wrong address got committed then fixed (`0x9912…` → `0xbA7d…`) | Single source of truth: deploy script **writes** the address/ABI file; CI check that docs/addresses match; **simulate rules before deploying**; Rulebook versioning (NFT_AND_CHAIN §3) so rules changes ≠ redeploys of Cards. |
| L4 | Battle randomness cancelled out (deterministic fights, admitted in NatSpec) | Our design has no randomness by default; the simulator proves depth before code. |
| L5 | "Generate" button disabled then re-enabled (`86be257`, `c6cfe66`) | Generation costs money/time: rate-limit, budget-cap, async with fallback — decided up front. |
| L6 | Vercel framework/lint breakages late in the build | Set up deploy pipeline in hour 1, not hour 9. |
| L7 | Leaderboard enumerates **every** token each refresh (`nextId` × 2 reads) | Fine at 10 cards, dead at 10 000: use indexer + pagination. |
| L8 | **Cherry-picking** (already noted in the private Promptmon analysis): the acceptor reads the challenger's public stats and only accepts winnable fights. Our public pools/Lite loadouts recreate it. | **Ranked bouts come only from blind matchmaking** (both sides locked before pairing). The challenge board and challenge-by-link are **unranked**. |

## 5. Brainstorm — new ideas sparked by Promptmon (not copies)
1. **The Booking** (T1): fighter creation as a police-booking interview; answers become flavour, taunts and the fighter's *voice* in bouts. **It must never block on art:** a fighter is playable immediately with a placeholder card while the art renders (`TECH_ARCHITECTURE.md` §7).
2. **Words in the ring:** the player's own sentence appears at key moments (entrance, KO, scar press) — authorship stays visible during play. *(Shows one player's text to the other → needs the same moderation as T2 plus a mute toggle.)*
3. **Living poster:** card art **ages** with scars (tears, stains, tape), rendered from on-chain data. *(Promptmon's creatures gained level and stats, but their visuals never changed.)*
4. **Ghost fighters:** the house roster doubles as a *tutorial ladder* (named opponents with signature habits).
5. **Rematch ledger:** per-opponent head-to-head record on-chain ("Nemesis"), a social hook Promptmon lacks.
6. **Shareable birth & scar press:** auto-generated 5-second clip/poster of the two WOW moments.

## 6. Questions for the user
1. Booking (3 questions) vs a single prompt box — which feels more "fight club" to you?
2. Marks (M1) — worth the balance risk, or keep progression cosmetic for v1?
3. Do you want the WOW-moment structure (named moments driving the build order) like Promptmon, and which two are ours?
