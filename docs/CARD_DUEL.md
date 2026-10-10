# The Duel — game design (current)

Status: **DRAFT v2, game only, desktop-first.** Single source of truth for *rules and play*. Numbers are placeholders to be tuned by the simulator (PLAN S0/S1).
Chain/NFT design → `NFT_AND_CHAIN.md`. Look & feel → `VISUAL_IMMERSION.md`.

**User decisions baked in:** game only (no crowd) · Lite **and** Full · cards are NFTs · a prompt changes **art/identity only** · fighters are built by **hand-picking modules** · **Auto** mode stays (hand-built playbooks) · desktop landscape first.

Vocabulary (fight-club, not Pokémon): **Fighter** · **Grit** (energy) · **Corner** (bench) · **Dirty Trick** (one-shot card) · **Pool** (registered cards) · **Loadout** (what you bring) · **KO**.

## 1. Take / refuse (Pokémon TCG → us)

| Take | Refuse / change |
|---|---|
| Active fighter + corner, **switching** as the central mind-game | Creature-collecting fantasy, names, art style, evolutions (IP + tone) |
| Energy that ramps each turn; attacks cost it | 60-card decks, draw randomness, 20-minute matches |
| 3-way weakness triangle | Coin flips as the core |
| One-shot trainer-style cards | Hidden deck/hand needing shuffle proofs on-chain |
| Win by KO count (cf. *Pokémon TCG Pocket*, ~5 min) | Prize cards, deck-out |

## 2. Core rules

> **Rulebook v1 is frozen** by the depth gate. The authoritative statement of every rule is [`packages/engine/RULES.md`](../packages/engine/RULES.md) (+ `rulebook.ts`); the player-facing explanation is [`HOW_TO_PLAY.md`](HOW_TO_PLAY.md). In one line: **attacks are LIGHT (cost ≤ 2) or HEAVY (cost ≥ 3); Brace beats LIGHT, HEAVY beats Brace, LIGHT beats HEAVY**; an unpunished Switch is free; a fighter carries exactly **one LIGHT + one HEAVY** attack (78 legal builds). The table below is kept short on purpose — don't restate numbers here.

- **Pool (public, locked) → Loadout (what you bring) → Lead (secret, revealed simultaneously).**
- **Grit:** both start at a format-set value, **+1 at the end of every turn**, cap 5. Public.
- **Turn (≈ 9 s):** both secretly choose ONE action → lock-in → simultaneous reveal → resolve.

| Action | Effect |
|---|---|
| **Attack 1 / 2** | Spend Grit; hit the opponent's active fighter **at resolution time** (after switches). |
| **Brace** | **Guard.** Fully blocks a LIGHT attack; a HEAVY attack breaks it for ⅔; +1 Grit (only the first Brace in a row). *(Rulebook v1 — see the guard triangle below.)* |
| **Switch → Corner A/B** | Swap active fighter; costs the *leaving* fighter's **retreat** in Grit. Resolves **before** attacks. **Refunded if the opponent didn't attack** (v1). |
| **Dirty Trick** | Play a face-down trick (costs 1 Grit); single-use; revealed on play; resolves in the Trick step. |

**Resolution order:** Switch → Dirty Trick → Attack. **Styles:** `BRAWL > CLINCH > SLICK > BRAWL`; advantage ×1.5 (round up), disadvantage ×0.67 (round down, min 1).
**KO replacement:** the owner makes a **fresh** commit→reveal of the replacement *before* the next commit window opens (nobody commits blind).
**Double KO:** both active fighters can KO each other in the same turn (common in Lite). Proposed: counts as a KO for both; if that decides the bout, one **sudden-death turn** between the corner fighters. S1 measures frequency. SPD first-strike (a KO cancelling a slower attack) is **off by default** — alternatives are simulator questions.

## 3. Formats (one engine, two parameter sets)

| | **Lite — "First Blood"** | **Full — "Main Card"** |
|---|---|---|
| Pool (public, locked) | 3 cards = the loadout | 8 cards |
| Loadout | 2 Fighters + 1 Trick, **public**; only the **lead** is secret | 3 Fighters + 2 Tricks, **secret set + lead** |
| Win | **First KO** | **2 KOs** |
| Target length | ~60–90 s | ~3 min |

**The numbers (turn cap, start Grit, HP scale, …) are NOT duplicated here** — the single source of truth is
[`packages/engine/src/rulebook.ts`](../packages/engine/src/rulebook.ts), explained in [`packages/engine/RULES.md`](../packages/engine/RULES.md)
and tuned by `pnpm --filter @sublevel/engine sim` / `tune`. (Current values at time of writing: Lite cap 8 / Grit 2 / HP 100%; Full cap 10 / Grit 3 / HP 75%; sudden death re-enters at half HP.)
Rating is separate per format. Same cards legal in both. *Exhibition (3 rounds, reduced HP) is a possible onboarding ruleset; decide after S1.*

## 4. A worked Full bout — ⚠ *pre-v1 illustration (old numbers, old Brace). For a current example see [`HOW_TO_PLAY.md` §12](HOW_TO_PLAY.md).*

**A:** Rust Dog (BRAWL, 7 HP, ret 1; Jab c1/2, Hammer c3/5) · Sister Nails (CLINCH, 8, ret 2; Hold c2/3, Slam c4/6) · The Accountant (SLICK, 6, ret 1; Cut c1/2, Audit c3/4) · Trick: **Cheap Shot** (c1, 2 dmg, ignores Brace/weakness).
**B:** Gina (SLICK, 6, ret 1; Jab c1/2, Combo c3/4) · Big Tony (BRAWL, 8, ret 2; Hook c2/3, Wreck c4/6) · Ivan (CLINCH, 7). A leads Dog, B leads Gina (SLICK beats BRAWL).

| T | Grit A/B | A | B | Result |
|---|---|---|---|---|
| 1 | 2/2 | Jab | Jab | Dog→Gina disadv **1**; Gina→Dog adv **3**. Dog 7→4, Gina 6→5. |
| 2 | 2/2 | **Switch → Nails** (−1) | Jab | Gina's Jab disadv **1**. Nails 8→7. |
| 3 | 2/2 | Hold | **Brace** | Hold adv 5, braced → **3**. Gina 5→2. B Grit 4. |
| 4 | 1/4 | Brace (only option at 1 Grit) | **Switch → Tony** (−1) | No damage. A Grit 3, B 4. |
| 5 | 3/4 | Hold | **Wreck** | Wreck adv **9** → **KO** Nails. Tony takes 2 → 6. **B leads 1 KO.** A replaces: Accountant. |
| 6 | 2/1 | Cut | Brace | Cut adv 3, braced → 2. Tony 6→4. |
| 7 | 2/3 | **Cheap Shot** | Hook | Tony 4→2; Hook disadv 2: Accountant 6→4. |
| 8 | 2/2 | Cut | **Switch → Ivan** (−2) | Cut disadv 1. **Turn cap → B wins on KOs (1–0).** |

**Findings:** (1) at these numbers only one KO happens in 8 turns, so **the first KO decides** — levers: lower HP, higher start Grit, longer cap, bigger attacks, or Lite. (2) The reads are real (T2 predict-and-switch, T3 predict-and-brace, T4 Grit starvation, T5 correct read, T8 dodge). (3) **Grit is the readable clock.**

## 5. Hidden information on-chain
A card can't be both **locked** (a public flag) and **secret**. So: the **pool is public**; **which cards you bring, their slots and the lead are secret** (five per-slot blinded hashes locked with the lead); a card is *opened* (card id + its own salt) in the same transaction as the move that first brings it into play; the Corner stays hidden until used. Every opening must match its locked slot hash, be in the locked pool, fit the slot (fighter/trick) and not repeat a card, else **forfeit**. Only a tied turn-cap decision or sudden-death re-entry forces the unplayed fighters open. Lite's loadout is public by design (only the lead is committed). No shuffle, no draw. Details → `NFT_AND_CHAIN.md` §3.

## 6. Stalling & pacing rules to test
Decision rule at the cap; diminishing Brace; Grit cap 5 stops hoarding; optional referee warning (2 turns with no damage → both take 1).

## 7. Balance requirements (the pass/fail for "does this have depth?")
A pure move cycle collapses to uniform-random play where scouting is worthless, so we require **state-dependent equilibria** and test them **before any contract**. (Re-stated for the card game; state space = HP × Grit × corner × tricks, bucketed.)

| ID | Requirement | Test (simulator) |
|---|---|---|
| **R1′** *(restated — see RULES.md for the reason)* | (a) ≥ 2 live action kinds (≥ 15% weight) in ≥ 50% of sampled states **and** (b) **exploitability gap ≥ 30 pts**: a best-responder that knows the opponent's policy must beat a near-deterministic bot far more often than a mixed one. *(Original R1 — ≥ 3 live kinds — is unattainable with this action set.)* | Depth-2 equilibrium over sampled states + the exploitability test (`gate check`). |
| **R2** | **Equilibrium shifts with state** (full vs low Grit, leader vs trailing, tricks left vs spent): total-variation distance ≥ 0.25 for most state pairs. | Compare solved mixes across buckets. |
| **R3** | **Reading pays.** A *reader* bot (public history + state) beats a *habit* bot (human-like biased mixes) by ≥ 8 points more than an *equilibrium* bot does, and does not beat the equilibrium bot. | Bot tournament, 10 000 bouts per pairing. |
| **R4** | **Stall is unprofitable** (all-Brace loses). | Tournament. |
| **R5** | **Length:** Lite 60–90 s / Full ~3 min; < 5% reach sudden death. | Simulation + timing. |
| **R6** | **Build parity:** every legal build (all 78 legal builds) lands within ~40–60% vs the field under equal-skill bots; dominant/dominated builds are rebalanced or retired. | Round-robin of all builds. |
| **R7** | **Readability:** a new viewer can tell "who is in danger" from HP/Grit alone after one turn. | Playtest. |
| **R8** | **Double-KO and first-KO snowball** frequencies are within agreed bounds in Lite. | Simulation. |
| **R9 (Auto)** | A hill-climbing / genetic search over the playbook DSL must **not** find a playbook beating more than ~65% of a diverse sampled field; otherwise Auto stays unranked. | Search harness. |

**Status (Rulebook v1):** R1′(b) ✅, R2 🟡, R3 🟡 Lite / ✅ Full, R5 ✅, R6 ✅ (76/78), R1′(a) 🟡 for Lite — numbers and caveats in [`RULES.md`](../packages/engine/RULES.md). If a gate fails we change the rules (costs, Grit gain, Trick effects) — **not** the contract. Fallback: fewer actions, Lite only first.

## 8. Controller modes — Live and Auto
**Live:** you choose each turn. **Auto:** you hand-build a **playbook** (a small decision table) and the Engine plays the bout from it, so you can fight while away. Same cards, formats and Engine — a 2×2 grid (Lite/Full × Live/Auto), costing one interpreter.
*(Reverses the earlier "no auto-battler" decision, by user choice; justified only if the activity is writing/testing/refining the table.)*

```
PLAYBOOK "Rust Dog" (hand-built on the napkin editor)
 1. IF turn = 1                         → ATTACK 1
 2. IF my_grit ≤ 2                      → BRACE
 3. IF opp_style beats my_style         → SWITCH best_matchup
 4. IF opp_hp ≤ 35% AND my_grit ≥ 3     → ATTACK 2
 5. IF opp_last = BRACE AND chance 40%  → TRICK
 6. DEFAULT                             → ATTACK 1
```
- **DSL limits:** ≤ 8 rules; conditions over **what is public at that turn in live play** (own/opp Grit, HP%, turn, style advantage, opp's last action, repeat count, seeded `chance p%` from both salts); no loops; **rules for lead choice and KO replacement** (S0 gap). No peeking at Full's hidden Corner.
- **Flow:** both commit `hash(playbook, salt)` → both reveal → Engine plays the bout deterministically in one or a few txs → events replay it. **Abort rule:** once the first player reveals, the second could compute the result and abort → forfeit must be at least as bad as a loss (scars, rating, any ante).
- **Honest caveats:** the table is hand-editable, so anyone can run a local search for a counter-table against an opponent's last *revealed* playbook → **Ranked Auto needs blind matchmaking** and passes R9, or stays unranked. NFT-fighter / agent-battle games exist; **do not claim Auto is unique.** "A bracket of N playbooks resolves in seconds" is **unmeasured**.
- **Not included:** English → table compile. Add only if the user says yes (it must remain optional; output schema-validated).

## 9. Prompts — identity only
A prompt changes **art and identity, never abilities or behaviour** (Promptmon's own rule; one pure validator shared client/server).
- **The Booking:** 3 short questions (name / what did they do / last words) → nickname, taunt, voice, flavour; fills a **style-locked** image template. Cosmetic; never blocks play (placeholder card until the art renders).
- **Chronicle:** after a bout an AI drafts one line of the card's story; the **owner accepts/edits and signs** it (never operator-written, so the Arena's hard-fact record stays tamper-proof). Optional; moderated; may live off-chain keyed by bout ID.
- **Moderation:** block real-person names/likenesses (a "mugshot" invites generating real people as criminals), NSFW, IP; report/remove flow.
- **Rejected:** prompt-to-build, prompt-to-behaviour, AI-scored trash talk, prompt-defined house rules.

## 10. Abuse & anti-abandonment (design-level)
- **Cherry-picking** (accepting only winnable fights): **ranked comes only from the first-come-first-served queue** (`Arena.joinRanked`; you cannot pick a challenge); challenge board and challenge-by-link are unranked. *Honest limit:* the second player into the queue can see who is waiting and decline to join, so opponent-picking is possible — unprofitable for rating (Elo), not for a belt defence. A commit-to-queue scheme would close it; not built.
- **Throwaway fighters to dodge scouting:** rank, belt and season eligibility attach to the fighter; mint fee + cooldown; practice bouts excluded from rank.
- **Wash fights / alt wallets:** rank gain scales with opponent rank and diversity; diminishing returns on rematches per day; documented as unsolved (sybil).
- **Stalling / non-reveal:** forfeit (`NFT_AND_CHAIN.md` §3.2).

## 11. Open questions for S0/S1
Pace levers (§4) · double-KO rule · SPD first-strike · state bucketing for the solver · whether Lite alone is enough for the one-day slice · number of Dirty Tricks per format · DSL spec for Auto (lead, replacement).
