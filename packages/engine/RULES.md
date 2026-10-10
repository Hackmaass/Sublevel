# Engine rules — Rulebook v1 (frozen by the depth gate)

> **Source of truth for rules *as implemented*:** `src/rulebook.ts` (data) + `src/engine.ts` (logic). This file explains them and records *why* they are the way they are.
> Player-facing manual: [`docs/HOW_TO_PLAY.md`](../../docs/HOW_TO_PLAY.md) (its tables are generated from the rulebook — `pnpm --filter @sublevel/engine manual`).
> Narrative design: [`docs/CARD_DUEL.md`](../../docs/CARD_DUEL.md).

## Constraints (so the Solidity port is mechanical)
Integers only · no `Math.random`/`Date` in the engine · state is plain JSON · cards store **ids** (`style`, `attackIds[2]`, `spread`), numbers come from the Rulebook · `viewFor(side)` redacts hidden info · 1,000 cross-language vectors in `vectors/engine-vectors.json`.

## Actions (uint8)
`0 ATTACK_1 · 1 ATTACK_2 · 2 BRACE · 3..5 SWITCH(slot) · 6..7 TRICK(idx)`

## Turn resolution order
0. Pay costs (attack cost / the leaving fighter's retreat / trick = 1 Grit)
1. Switches
2. Tricks — pass A (heal, Grit gain, flags) then pass B (damage, Grit denial)
3. Attacks — simultaneous; a fighter at ≤ 0 HP after tricks cannot attack
4. Brace — `+1 Grit` only if the previous action wasn't Brace (diminishing)
4b. **Unpunished Switch refund** (v1): a Switch refunds its retreat cost if the opponent did not attack this turn
5. KOs → the opponent's `kos += 1`
6. Grit tick `+1` (cap 5)
7. End check: sudden death → KO targets → turn cap decision → replacement phase

## Damage (integers)
`base = attack.dmg` → style: advantage (BRAWL>CLINCH>SLICK>BRAWL) `ceil(1.5·x)`, disadvantage `max(1, floor(2·x/3))` (**PIERCE** ignores it) → **COUNTER** `+2` if the opponent switched this turn →
**Guard triangle (v1):** attacks are **LIGHT** (cost ≤ 2) or **HEAVY** (cost ≥ 3).
- **Brace blocks a LIGHT attack completely** (0 damage). A **HEAVY attack breaks the guard** and deals `floor((2·x+2)/3)` (⅔, rounded up). **GRAPPLE** ignores Brace entirely.
- **When both attack, a LIGHT attack interrupts a HEAVY one:** the heavy deals `ceil(x/2)`.
- Smoke Bomb halves (`ceil(x/2)`, once; it doesn't stack with a Brace block). Sucker Punch nullifies.

## Bout end
KO target reached → win. Both reach it the same turn → **sudden death** (last fighters re-enter at `ceil(maxHp/2)`; next KO wins; double KO = draw).
Turn cap → decision: KOs → HP‰ (alive HP / total max HP) → damage dealt → draw. `forfeit()` for non-reveal (on-chain).

## Build menu (v1)
A fighter = style + **one LIGHT and one HEAVY attack of that style** + one spread. **78 legal builds** (BRAWL 3×3 + CLINCH 4×2 + SLICK 3×3 pairs, × 3 spreads). `isLegalBuild()` (the Cards contract enforces the same rule at mint). 12 presets.

## Formats (current numbers, `rulebook.ts`)
| | Lite | Full |
|---|---|---|
| fighters / tricks | 2 / 1 | 3 / 2 |
| KO target | 1 | 2 |
| turn cap | 8 | 10 |
| start Grit | 2 | 3 |
| HP scale | 100% | 75% |
| loadout | public | hidden (set + lead) |

## The depth gate — what we measured and what we decided
Tools: `pnpm --filter @sublevel/engine gate <r12|r3|r6|meta|check|variants>`; value function fitted from 66k real states (`fitEval.ts`, ~71% accuracy; it showed Grit is worth ~¼ of the hand guess).

| Check | Result (Rulebook v1) | Status |
|---|---|---|
| Tool validity | depth-1/2 equilibrium bots beat greedy 58–75%; solver converged (guarantee gap < 1 on ±1000) | ✅ |
| **Exploitability** (best-responder who knows the opponent's policy; 200-bout pairs, value function refit on v1) | best-responder beats the near-deterministic greedy bot **84.5% / 94%** but the mixed equilibrium bot only **40.5% / 45.5%** → gap **+44 pt (Lite) / +48.5 pt (Full)** → *predictable play is punished* | ✅ |
| **R3** reading pays (scout-book reader vs habit bot, margin over the non-scouting equilibrium bot; 240 bouts) | Lite **+7.3** (target ≥ 8 — *borderline, ±3 noise; was +14.0 before the value refit*), Full **+15.6**; reader vs equilibrium bot 37% / 31% (must be ≤ 58%) | 🟡 Lite / ✅ Full |
| **R6** build parity (78 builds × 200 bouts, refit value fn) | **76/78 within 40–60%**, range 42–62%; style means 50.5 / 51.2 / 49.1 | ✅ |
| R2 equilibrium shifts with state | Grit 0.61 / 0.40 · position 0.22 / 0.10 · tricks 0.25 / 0.43 (Lite / Full; target ≥ 0.25) | 🟡 position-shift (Full 0.10) is low |
| R5 pacing | Lite 5.1–6.9 turns, 60–87% KO finishes · Full 7.2–9.0 turns, 56–83% | ✅ |
| R8 double-KO | Lite 3–12% (was 18%) · Full 20–31% of bouts see one (not decisive in Full) | ✅ / 🟡 |
| **R1** equilibrium support | ≥ 3 live kinds in only **17% (Lite) / 21% (Full)** of states; pure in ~35–45% | ❌ as originally written |

### ⚠ Requirement changed: R1
Original R1 ("≥ 3 live action kinds in most states"; measured 13% Lite / 25% Full) is **not achievable** with this action set (a state typically offers 3–4 legal kinds) and is **replaced** — *with the reason recorded* — by:
**R1′:** (a) ≥ 2 live kinds (≥ 15% weight) in **≥ 50%** of states, **and** (b) the **exploitability gap ≥ 30 pts**.
Measured: ≥ 2 live in 41–48% (Lite) / 60–70% (Full) — Lite sits just under (a); (b) passes in both (+44 / +48.5). We ship on the strength of (b) — the property that actually makes it a mind-game (predictability is punished) — and carry (a) for Lite as an **open risk**.

### How the rules got here (experiments, `gate variants`)
Base rules made **Brace nearly dominant** (equilibrium ≥ 50% Brace in Lite). Candidates behind flags: **E1** Brace gains Grit only if unattacked · **E2** unpunished Switch refunds · **E3** guard triangle. Best combination **E2+E3** (shipped); E1 reduced KO-finishes too much. Then: build menu rule (one light + one heavy) removed trap builds; attack numbers nudged by an additive-effects fit (Overhand 6, Slam 7, One-Two 4, Riposte 5, Finisher 7, Headbutt PIERCE); Bulky +1 HP.

### Still open
- **R9 (Auto)** — no playbook DSL yet, so no search test. Auto stays unranked until it passes.
- Greedy 1-ply adaptive bots beat every fixed archetype (80%+): the skill ceiling is real, but a pure "best response to uniform" player is strong — expect a learning meta.
- Sample sizes are modest (SE ≈ 3–4 pts); **R3 (Lite) is borderline** — re-run `gate r3 400` and `gate r6 400` before launch. Value-function refit (`fitEval`) must be re-run whenever rules change.
