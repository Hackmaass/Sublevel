# NFT & Blockchain Implementation (current)

Status: **DRAFT v2, game only, desktop first.** The crowd layer is parked (§9). The NFT/chain design was delegated to me by the user ("improvise"); the choices below are mine, with reasons — push back on any. Rules → `CARD_DUEL.md`; stack, trust boundary and commit–reveal rules → `TECH_ARCHITECTURE.md`.

## 1. Thesis
> **The card is a fighter's career, not a power-up.**
> Mechanics are open and balanced. The NFT is the *identity* (art you authored), the *build* you chose, and the
> *unforgeable record* of every bout it fought. (An optional, off-by-default Spoils mode can let a card be won from a rival; the value story doesn't depend on it.)

Why this and not "rare = strong": competitive integrity (no pay-to-win), clean legal posture (no packs), and an honest
story for judges: *"you write who your fighter is and pick how they fight; it remembers every fight; nobody can edit its history."*

## 2. The card

| Part | Where | Mutable? | Notes |
|---|---|---|---|
| **Build** — `styleId, attackIds[2], spreadId` (Rulebook IDs from the module menu) | on-chain (`Cards`) | **No** (immutable after mint) | The card stores **IDs, not raw numbers**. The numbers come from the season's pinned Rulebook (§3), so careers survive balance patches. |
| **Identity** — name, nickname, art hash, flavour line | on-chain hash + off-chain image | No | Authored from a prompt (AI), or picked from a fallback gallery. **Art never changes stats.** |
| **Record** — bouts, wins, KOs dealt/taken, streak, rivals | on-chain, written only by `Arena` | Yes (append-only counters) | The thing that can't be faked. |
| **Scars** — marks earned from specific events (first KO, comeback win, 10-win streak, taken as spoils…) | on-chain bitmask, written only by `Arena` | Yes | **Cosmetic only** in v1. |
| **Provenance** — creator, mint block, previous owners (events) | events | — | "Taken from X" is part of a card's legend. |

### 2.1 Card model (user decision: hand-picked module menu ships in v1)
- **Fighter** = pick **1 of 3 styles**, **one LIGHT + one HEAVY attack of that style**, **1 of 3 stat spreads** → **78 legal builds** (BRAWL 3×3 + CLINCH 4×2 + SLICK 3×3 pairs, × 3 spreads), plus authored art/name/flavour. **The Cards contract enforces the one-light-one-heavy rule at mint** (`isLegalBuild`). **~12 curated presets** are shortcuts into the menu (and the free starter pool).
- **Dirty Trick** = one of ~6 trick templates + art/name.
- **No prompt-to-build.** A prompt only affects art/identity (`CARD_DUEL.md` §9).
- **Balance is proven, not priced:** S1 round-robins **all** builds; any build outside ~40–60% vs the field is rebalanced or **retired** before launch (R6). There is no cost cap (every fighter is the same power class).
- The skill layer is **build choice, pool building** (cover the style triangle, mix speeds, hide counters) and **loadout choice per matchup**.
- **Honest trade-off:** because the numbers live in a season-pinned Rulebook, a balance patch *does* change how an existing card plays **between** seasons; it can never happen mid-season or silently (§3).

### 2.2 Why a card is worth owning when mechanics are free
1. **Authorship & identity** (your fighter, your words).
2. **Career value** — a 40-win card with a scar collection is a trophy, like a sports card with stats.
3. **Pool access**: you need cards to field a pool (free starters exist so nobody is locked out).
4. **Tradability** of famous cards (standard ERC-721 transfers when not locked).
5. **Spoils (optional, OFF in the public build)**: a bout may ante **one declared card each**; winner takes the loser's card
   **with its career**. Staking NFTs with winner-takes-card is the same legal flag as betting (PLAN D6 / R-LEGAL), so **the value
   story must not depend on it**.

### 2.3 Wallet & marketplace display (required for the thesis to work)
- `tokenURI` returns JSON whose **attributes include the live record and scars** (bouts, wins, KOs, streak, scars bitmask, template, style).
- Emit **ERC-4906 `MetadataUpdate(tokenId)`** whenever `Arena` changes a record so wallets/marketplaces refresh.
- Art is **content-addressed and pinned** (IPFS/Arweave-style hash stored on-chain), not just served from our server; the card
  image with scars is rendered deterministically from on-chain data by an open renderer.
- (Promptmon never overrode `tokenURI`; its cards would not show up properly in wallets — we avoid that.)

## 3. Contract set

```
Rulebook (immutable per version) ──► Engine (pure library) ◄── used by Arena
Cards (ERC-721) ◄──write record── Arena ──► Ladder (rating, in Arena or separate)
Armory (pool registry + session delegation) ──locks──► Cards
```

| Contract | Responsibility |
|---|---|
| **Rulebook (per season)** | Immutable tables mapping **template IDs → numbers**: fighter stats/attacks, trick effects, format parameters (Lite/Full), style multipliers. **Each season pins exactly one Rulebook**, published in advance. Cards keep working across seasons because they hold template IDs; the operator cannot change a live season. A template removed in a later season is simply "retired" (still ownable/tradeable, with its career, but not legal in ranked). |
| **Engine** (library) | `resolve(state, actionA, actionB, rulebook) → state'`. Pure. Deterministic. Unit-tested against vectors shared with the TS engine (simulator, bot, UI). |
| **Cards** (ERC-721) | `mint(templateId, artHash, flavour)` → validates the template is legal; stores identity; `locked` flag via `_update` override (the lock-instead-of-escrow pattern); record/scars writable **only** by `Arena`; `tokenURI` + ERC-4906 (§2.3). Mint fee (small, testnet MON) + per-address cooldown to deter spam. |
| **Armory** | `register(format, cardIds[])` = a **public pool** (Lite 3 / Full 8) → locks them. **A card can be in only one active pool/bout at a time.** `unregister` when idle. |
| **Session delegation** (in Armory) | `authorize(sessionKey, expiry)`. **Session-key scope is strictly: `commit`, `reveal`, `revealOpen`, `revealLead`, `openCards`, `openAfter` (and the permissionless `claimTimeout`).** The **owner wallet** is required for: `register`/`unregister`, `createChallenge`/`accept` (any with an ante), anything that locks, transfers, approves or burns a card. A leaked burner can therefore at worst make that owner forfeit bouts until it expires or is revoked (authorisation is per owner, ≤ 7 days; the client issues short per-session keys); it can never move a card or touch a record. |
| **Arena** | Challenge/accept, `commitLoadout`, per-turn `commit`/`reveal`, KO replacement step, resolve, timeouts/forfeits, result → Cards.record, spoils transfer, rating. |
| **Ladder** | Simple Elo per (address, format) — or events-only with an indexer; decide by gas/time. |

### 3.1 Bout lifecycle (Arena)
1. **Challenge** — `createChallenge(format, poolId, anteCardId?)` publicly, or private via invite code/link. Opponent `accept(...)`.
   **Ranked bouts come only from blind matchmaking** (both sides lock in before they're paired), because a public challenge board lets
   an acceptor read the challenger's pool and cherry-pick winnable fights (Promptmon's defect). Board and link challenges are **unranked**.
2. **Loadout commit** — *Full:* the lead commit binds the **lead slot and five blinded slot hashes** (3 fighters + 2 tricks): `slotHash_i = keccak(chain, arena, bout, side, i, cardId, slotSalt_i)`. Every slot is salted separately — the pool is public (8 cards), so an unsalted hash or a Merkle sibling could be brute-forced. Five fixed slots need no Merkle tree: each later opening is a single hash check. *Lite:* the 3-card loadout is **public**; only the lead is commit-revealed.
3. **Lead reveal** — both reveal their lead simultaneously (Full: `revealLead` publishes the five hashes and opens the lead card).
4. **Turns** — `commit(actionHash)` → both committed → `reveal(action, salt[, cardProof])` → `Engine.resolve` → events. If a fighter is KO'd: owner makes a **fresh** `commitReplacement` → `revealReplacement` **before** the next commit window opens.
5. **Finish** — KO target reached, or turn cap → decision (KOs → remaining HP → damage dealt). **Double KO:** see §6.1.
6. **Full loadout reveal (Full only)** — both reveal all five cards incl. unplayed. The key check: **the loadout is a subset of the registered, locked pool** (which already proves ownership; a card can only be in one pool), no duplicates, and consistency with every card played. Missing/invalid = **forfeit**.
7. **Settle** — update records/scars/rating; if ante: `_transfer` loser's declared card → winner; unlock pools.

### 3.2 Rules carried over (non-negotiable — full text in `TECH_ARCHITECTURE.md` §4)
Strict phases · salt = `keccak(sig(sessionKey, boutId, turn))` (refresh-safe) · non-reveal = forfeit · domain-separated hashes
(chainId, Arena, bout, turn, player) · pull-payments for any MON · no `prevrandao`/VRF in the base game.

## 4. Why each piece is on-chain (the "what breaks if it's a database?" test)

| On-chain | If it were a DB |
|---|---|
| Commit–reveal + Engine resolution | The operator could peek at moves or edit results. |
| Hidden-loadout slot hashes + on-demand openings (each opening must match its slot hash, the locked pool, the slot's kind, one use per card) | No way to prove nobody swapped cards mid-bout. |
| Card record & scars | History becomes editable → a "career" has no value. |
| Spoils transfer & locks | Needs trusted custody. |
| Immutable Rulebook versions | The operator could silently rebalance or nerf your card. |
| Open Rulebook/Engine | Third parties can build bots, tournaments, analytics — a real ecosystem hook. |

Off-chain (deliberately): art generation, matchmaking convenience, the sparring bot, analytics, animations.

## 5. Monad-specific implementation notes
- A Full bout is ~8 turns × (2 commits + 2 reveals) ≈ 32 txs + setup. At ~0.3 s blocks / 0.6 s finality (`TECH_ARCHITECTURE.md` §1) each phase is ~1–2 s; a 9 s turn has slack.
- **Auto-reveal:** the client sends `reveal` automatically once it observes both commits — the player taps **once** per turn.
- **Gas is charged on the gas *limit*** → set tight per-function limits; the **reserve-balance** rule means session keys need drips sized to `gas_bid × gas_limit × expected txs` with margin. **Verify on testnet.**
- Session keys hold **only gas**, never cards; the owner wallet holds the NFTs. This is the NFT-safe version of "guest-first".
- Parallel execution helps only if txs touch disjoint state — bouts are independent, so many simultaneous bouts scale.
- `eth_subscribe`/`monadNewHeads` for push (verify availability). **`eth_getLogs` is capped at 100 blocks on the public RPC** → no state may depend on it; keep enumerable on-chain views (`cardsOf(owner)`, counters, `getRecord`) and an indexer (`TECH_ARCHITECTURE.md` §1).

## 6. Formats — chain-relevant bits only
The format rules (pool/loadout sizes, win conditions, caps, Grit, double-KO) live in **`CARD_DUEL.md` §3 and §2** — one source of truth.
What matters on-chain:
- **Lite:** ~12–16 txs per bout; loadout is **public** (only the lead is commit-revealed) — simple on purpose and cheaper.
- **Full (built, tested):** ~32 txs per bout; **secret hand + lead**. A card is *opened* in the same tx as the reveal that first needs it (switch / trick / replacement). Only two rules read unplayed roster data — sudden-death re-entry and a *tied* turn-cap decision — so the Engine pauses there (`OpenCards` phase) and each side opens exactly what is needed; a side that doesn't forfeits at the deadline. Nothing else is revealed unless the owner publishes it after the bout (`openAfter`, cosmetic).
- Ratings are separate per format; the same cards are legal in both.

### 6.2 Optional timing variant — "Correspondence" (not built now)
Commit–reveal works asynchronously for free: a format parameter `turnDeadline = hours` instead of seconds. It solves the
"no crowd, no opponent online" problem better than a bot alone. Keep in the roadmap; the engine needs no change.

## 7. Experience flow (no crowd)
1. **Open →** play instantly: free **starter pool** (non-valuable, the presets), **Sparring** vs a bot (off-chain, same engine, no txs) to learn. **House fighters** (a different thing) are on-chain, unranked opponents whose records come from real Arena bouts played by bot accounts — never admin-written.
2. **Make a fighter:** the 3-question *Booking* → portrait (or gallery) → **hand-pick** style / 2 attacks / spread → mint (small testnet fee).
3. **Build a pool** (Armory): the game nudges coverage across the style triangle.
4. **Fight:** quick-match, open challenge board, or **challenge by link** (send to a friend; the viral loop). Pick a format.
5. **Bout:** corner screen (pick lead + loadout, 20 s) → turns → KO/decision → result poster, new scar.
6. **Aftermath:** rivalries (head-to-head record per opponent), rating, rematch button, optional **Spoils** bouts.
7. **Share/Replay:** every bout is replayable from logs.

## 8. Open risks (to resolve in S0/S1 and A2)
- **Depth/pacing** for both formats (simulator).
- **Build balance**: 78 legal builds — R6 round-robin: 76/78 within 40–60% (range 42–62%) on Rulebook v1; re-run at n≥400 before launch.
- **Hidden-loadout complexity** on-chain (Full only) — built with per-slot blinded hashes and on-demand openings; the cost is gas (Full reveals ≈ 0.3–0.6 M EVM gas, re-measure on Monad) and UX (every switch/trick/replacement tx carries an opening).
- **Session-key leakage**: a key is authorised per *owner* until its expiry (≤ 7 days; the client uses short, per-session keys) and can only commit/reveal/open. Worst case: the key's owner forfeits bouts that seat plays until the owner calls `revokeSession` or it expires — no card, pool or record can be touched. Test it explicitly (done: `test_session_key_can_play_but_never_touch_cards_or_bouts_setup`).
- **Mint-farming / sybil** (alt wallets to farm rating or records): fee + cooldown + rating only vs distinct opponents; document honestly as unsolved.
- **AI art moderation** (NSFW/IP): filter + gallery fallback.
- **Rulebook versioning**: how old cards behave in a new season (grandfather vs re-mint).
- **Matchmaking liquidity** with no crowd: needs the sparring bot and challenge-by-link to avoid empty lobbies.

## 9. Parked (not deleted)
Floor calls, house-rule votes, Call-Up, Roar meter, projector "Ring" view, pari-mutuel betting. Replays-from-logs remain a free
by-product. If we later want a "watch" mode it is an add-on over the same events.
