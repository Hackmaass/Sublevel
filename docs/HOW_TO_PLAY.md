# How to play SUBLEVEL

> A one-on-one card duel played in a basement. Both fighters choose a move **in secret**, both reveal **at the same time**, and the result is the same for everyone: no dice, no hidden referee.
> Tables in this file are **generated from the rulebook** (`pnpm --filter @sublevel/engine manual`), so they always match the game. Rules version: **v1**.

---

## 1. The idea in thirty seconds
1. You bring a small **corner** of fighters and a **Dirty Trick**.
2. Every **turn** each side secretly picks **one** action, locks it in, and then both are revealed together.
3. Damage is **not random**. Who wins a turn depends on *what you picked against what they picked* — so you win by **reading** your opponent.
4. First to the **KO target** wins (Lite: one KO · Full: two KOs).

---

## 2. Your corner
| | **Lite — "First Blood"** | **Full — "Main Card"** |
|---|---|---|
| Fighters | 2 | 3 |
| Dirty Tricks | 1 | 2 |
| Win by | **1 KO** | **2 KOs** |
| What your opponent can see | your whole corner (only your **lead** is secret) | **only** your active fighter — the rest of your corner and your tricks are hidden until used |
| Rough length | ~1 minute | ~3 minutes |

**Full on the ledger:** you register a pool of **8 cards** and secretly choose which **3 fighters and 2 tricks** to bring (and which fighter leads). A card is shown only when you play it — switching to a fighter, using a trick, or sending in a replacement shows it in the same move. Two things force your unplayed fighters into the open: a **tie at the turn cap** (the decision compares everyone's HP) and **sudden death**. If you refuse to show them you forfeit. Your tricks are never forced.

**Building a fighter:** pick a **style** (BRAWL, CLINCH or SLICK), then **one LIGHT and one HEAVY attack** of that style, then a **spread** (how tough vs how mobile). A prompt only changes a fighter's **looks and story** — never what they can do.

---

## 3. A turn, step by step
1. **Read the board.** Everything that matters is public: both fighters' **HP**, both **Grit**, the **style matchup**, and how many **tricks** are left.
2. **Pick one action** (below). You can change your mind until you lock in.
3. **Lock in.** A token drops on the table. You can't undo it.
4. **Reveal.** Both choices flip at once. Then it resolves in this order: **Switch → Dirty Trick → Attack**.
5. **Aftermath.** Everyone gains **+1 Grit** (max 5). If a fighter went down, their owner brings in the next one *before* the next turn.

If you run out of time the game picks **Brace** for you (in sparring). Once the game is on-chain (coming), **failing to lock in or reveal will be a forfeit** — losing is always better than stalling.

---

## 4. The five actions
| Action | What it does |
|---|---|
| **Attack 1 / Attack 2** | Spend Grit and hit their active fighter. Each fighter has one **LIGHT** and one **HEAVY** attack. |
| **Brace** | Guard up. **Fully blocks a LIGHT attack.** A HEAVY attack **breaks your guard** and still deals ⅔. You gain **+1 Grit** — but only the first Brace in a row. |
| **Switch** | Swap your active fighter for one from your corner (costs the *leaving* fighter's **retreat** in Grit). Resolves **before** attacks, so their hit lands on your **new** fighter. **If they don't attack, the Switch is free** (refunded). |
| **Dirty Trick** | Flip one face-down trick. Costs 1 Grit, once per bout. |
| *(timeout)* | Auto-**Brace**. |

### The guard triangle (the heart of the game)
- **Brace beats a LIGHT attack** (blocked).
- **A HEAVY attack beats Brace** (breaks the guard).
- **A LIGHT attack beats a HEAVY attack** if both swing at once (the heavy is interrupted and deals half).
- **A Switch** dodges a bad matchup and costs nothing if they don't attack — but if they *do* attack, they hit your **new** fighter, and a **COUNTER** attack punishes the swap (+2).

So: *heavy into a Brace* is good, *heavy into a light attack* is bad, *Brace into a heavy* is bad, *Brace into a light* is great. Guess right, win the turn.

---

## 5. Grit
Grit is your fuel (max **5**). Every attack, switch and trick costs Grit; everybody gets **+1 at the end of each turn**; a first **Brace** gives another **+1**.
- **Grit is public** — so you can read what your opponent *can* afford (at 1 Grit they can't throw a heavy).
- The matchsticks on the table are your Grit. Lit sticks are spendable.

---

## 6. Damage, styles and riders
**Style triangle:** **BRAWL beats CLINCH beats SLICK beats BRAWL.**
- With the advantage your hit deals **×1.5** (rounded up). At a disadvantage it deals **×⅔** (rounded down, min 1).
- **PIERCE** attacks ignore a bad matchup.

**Riders**
- **GRAPPLE** — ignores Brace completely (CLINCH).
- **COUNTER** — **+2 damage** if the opponent switched this turn (SLICK).
- **PIERCE** — ignores bad style matchups.

---

## 7. Winning
- **KO:** a fighter at 0 HP is out. Reach the **KO target** to win (Lite 1 · Full 2).
- **Double KO:** if both sides would win in the same turn, the last fighters re-enter at **half HP** for **sudden death** — the next KO wins.
- **Turn cap:** if nobody gets there, it goes to a **decision** — most KOs, then most remaining HP, then most damage dealt.

---

## 8. How to read an opponent (and not be read)
- **Low on Grit?** They probably Brace, Switch, or play a trick. **Full Grit?** Expect a heavy.
- **Bad matchup?** Expect a Switch — a **COUNTER** attack will punish it.
- **They keep Bracing?** Throw a **heavy** or a **GRAPPLE**.
- **They keep swinging heavy?** **Light** interrupts it; **Brace** now hurts you (heavy breaks guard) — so a light attack is the answer.
- Once on-chain, every bout is **recorded** and anyone can look up how a fighter has behaved before — so can you. Mix it up.

---

## 9. Controls (desktop)
| Key | Action |
|---|---|
| **1 / 2** | Attack 1 / Attack 2 |
| **3** | Brace |
| **4 / 5** | Switch to your first / second benched fighter |
| **T / Y** | Dirty Trick 1 / 2 |
| **Enter / Space** | Lock in |
| **Esc** | Clear your pick (or close this manual) |

Click works too. Hover a card for its numbers.

---

## 10. Glossary
**Grit** your energy · **Corner** your benched fighters · **Lead** the fighter you start with (revealed together) · **Retreat** the Grit it costs to switch *out* · **Dirty Trick** a one-shot card · **KO** knockout · **Light / Heavy** attacks costing ≤ 2 / ≥ 3 Grit · **Brace** guard · **Sudden death** the tie-break turn · **Ledger** the book that records every confirmed move (the chain) · **Scar** a permanent mark a card earns from fights.

---

## 11. The numbers (generated)

### Attacks
<!-- GEN:attacks -->
| Style | Attack | Class | Grit | Damage | Rider |
|---|---|---|---|---|---|
| BRAWL | **Jab** | LIGHT | 1 | 2 | — |
| BRAWL | **Hook** | LIGHT | 2 | 4 | — |
| BRAWL | **Overhand** | HEAVY | 3 | 6 | — |
| BRAWL | **Haymaker** | HEAVY | 4 | 8 | — |
| BRAWL | **Body Blow** | LIGHT | 2 | 3 | PIERCE — ignores bad matchups |
| BRAWL | **Rampage** | HEAVY | 3 | 5 | PIERCE — ignores bad matchups |
| CLINCH | **Shove** | LIGHT | 1 | 1 | GRAPPLE — ignores Brace |
| CLINCH | **Hold** | LIGHT | 2 | 3 | GRAPPLE — ignores Brace |
| CLINCH | **Headbutt** | LIGHT | 2 | 4 | PIERCE — ignores bad matchups |
| CLINCH | **Takedown** | HEAVY | 3 | 5 | GRAPPLE — ignores Brace |
| CLINCH | **Slam** | HEAVY | 4 | 7 | GRAPPLE — ignores Brace |
| CLINCH | **Knee** | LIGHT | 1 | 2 | — |
| SLICK | **Paper Cut** | LIGHT | 1 | 2 | — |
| SLICK | **One-Two** | LIGHT | 2 | 4 | — |
| SLICK | **Counter** | LIGHT | 2 | 3 | COUNTER — +2 if they switch |
| SLICK | **Riposte** | HEAVY | 3 | 5 | COUNTER — +2 if they switch |
| SLICK | **Flurry** | HEAVY | 3 | 5 | — |
| SLICK | **Finisher** | HEAVY | 4 | 7 | — |
<!-- /GEN:attacks -->

### Spreads
<!-- GEN:spreads -->
| Spread | HP (full scale) | Retreat (Grit to switch out) |
|---|---|---|
| Bulky | 11 | 2 |
| Steady | 8 | 1 |
| Nimble | 6 | 0 |
<!-- /GEN:spreads -->

### Dirty Tricks
<!-- GEN:tricks -->
| Trick | Effect (cost 1 Grit, once per bout) |
|---|---|
| **Cheap Shot** | Deal 2 damage to their active fighter. Ignores Brace and weakness. |
| **Patch Up** | Heal your active fighter for 3. |
| **Second Wind** | Gain 2 Grit. |
| **Smoke Bomb** | Their attack this turn deals half damage. |
| **Sucker Punch** | If they attack: take no damage from it and deal 3 to them. |
| **Low Blow** | They lose 2 Grit. |
<!-- /GEN:tricks -->

### Formats
<!-- GEN:formats -->
| | Lite | Full |
|---|---|---|
| Fighters / Tricks | 2 / 1 | 3 / 2 |
| KOs to win | 1 | 2 |
| Turn cap | 8 turns | 10 turns |
| Starting Grit | 2 (max 5) | 3 (max 5) |
| HP scale | 100% | 75% |
| Opponent sees your corner? | yes (only the lead is secret) | no (hidden until used) |
<!-- /GEN:formats -->

### Starter fighters (presets)
<!-- GEN:presets -->
| Fighter | Style | Attacks | Spread | |
|---|---|---|---|---|
| **Rust Dog** | BRAWL | Jab + Haymaker | Steady | *Hits like a truck, thinks like a dog.* |
| **Big Tony** | BRAWL | Hook + Overhand | Bulky | *Slow. Heavy. Patient.* |
| **Gutter Saint** | BRAWL | Body Blow + Rampage | Steady | *Doesn't care about your advantage.* |
| **Sister Nails** | CLINCH | Hold + Slam | Bulky | *Once she has you, she has you.* |
| **Ivan the Vice** | CLINCH | Shove + Takedown | Steady | *Quiet. Always close.* |
| **Knuckles Malone** | CLINCH | Headbutt + Takedown | Nimble | *Elbows, knees, bad intentions.* |
| **The Accountant** | SLICK | Paper Cut + Flurry | Steady | *Audits your guard. Every time.* |
| **Gina Glass** | SLICK | Counter + Flurry | Nimble | *Dances out. Cuts in.* |
| **Old Reliable** | SLICK | Counter + Riposte | Bulky | *Lets you tire yourself out.* |
| **Mercy Kane** | SLICK | Paper Cut + Finisher | Steady | *A finisher with a conscience. Almost.* |
| **Dutch Pete** | BRAWL | Jab + Overhand | Bulky | *Takes it. Gives it back.* |
| **Small Hours** | CLINCH | Knee + Slam | Nimble | *Light on his feet, heavy on grudges.* |
<!-- /GEN:presets -->

---

## 12. A worked turn
*Rust Dog (BRAWL, 3 Grit) vs Sister Nails (CLINCH, 2 Grit). Rust Dog has the advantage.*
- You think they're going to Brace, so you pick **Overhand** (HEAVY, 3 Grit). They **do** Brace.
- Heavy **breaks the guard**: Overhand deals 6, ×1.5 for the matchup = **9**, then ⅔ through the broken guard = **6**.
- You spent 3 Grit (0 left, +1 at turn end = **1**). They gained +1 for the Brace and +1 at turn end (2 + 1 + 1 = **4**).
- Next turn: you're at **1 Grit** — you can't throw a heavy, they know it, and they're at **4 Grit**. What do you do?
