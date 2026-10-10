# Visual & Audio Direction — "The Table" (desktop landscape first)

Status: **DRAFT v2.** Absorbs the former `VISUAL_DIRECTION.md` (palette, type, materials, sound, voice). Game only; desktop landscape first, mobile portrait is a later layout.

**User decisions:** very visually immersive · desktop landscape first · prompt = art/identity only · Auto stays.

## 1. What "immersive" means here
Not "more effects": **you believe you are somewhere, and your hands are doing something physical.**

| Lever | Meaning for us |
|---|---|
| **Place** | A specific, lived-in fight-club basement — a *scene*, not a menu. |
| **Body** | Physical gestures: slam a token to commit, flip to reveal, press to stamp (each with a one-click/keyboard equivalent). |
| **Consequence** | The room remembers: table scratches, card wear, ledger lines. Damage is *kept*. |
| **Light & sound** | One practical light, haze, spatial audio, **silence before the flip**. |
| **Diegetic UI** | Information lives in objects (matches, tally, napkin, ledger) — with a 2D overlay for the numbers that decide turns (§6). |

## 2. Concept: THE TABLE (chosen), vs rejected
- **THE TABLE (chosen):** a battered table under one swinging bulb. Fighters are **cardboard standees** (the card's cut-out portrait with parallax depth and a shadow) on a **chalk ring**. The AI portraits *are* the characters — **no 3D character models or rigging**.
- *Ringside (full 3D fighters)* — rejected for the core: user-made fighters can't be rigged reliably, heavy, closest to Promptmon's look. Possible later as an Auto/replay wide shot.
- *Motion poster (flat kinetic type)* — folded in: its **impact frames** are the hit language.

## 3. Desktop landscape composition
**Camera:** a **side-on tabletop diorama** — the table seen from its long edge, ~25–30° above, slightly wide lens. **You are always on the left** (the opponent's client mirrors it), as in a fighting game; this also avoids ever showing a standee's back. Your hand fans along the lower-left; the opponent's hand shows as card backs upper-right. A bare bulb hangs above; chain-link and haze behind; the Ledger sits at the near corner; the napkin at the far.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [YOU  name  HP ▓▓▓▓░░ 5/7  Grit ●●○]     ⏱ 0:07   turn 4/8   [OPP name  HP ▓▓▓░ 3/6  Grit ●●●●]│  2D overlay (fighter plates)
│                                  (bulb)                                    │
│  your Corner (face-down)                                  their Corner     │
│   ┌──┐ ┌──┐        ╭──────── chalk ring ────────╮            ┌──┐ ┌──┐    │
│   └──┘ └──┘   [STANDEE A]      ⇄       [STANDEE B]           └──┘ └──┘    │
│  📖 Ledger                                              opp hand (backs)   │
│  ════ your hand: fan of cards (hover to lift + details) ═══════════════════│
│ [1 Jab][2 Heavy][3 Brace][4 Switch ▾][T Trick]            [ LOCK IN  ⏎ ]   │  action bar
└────────────────────────────────────────────────────────────────────────────┘
```
- **Targets:** 1920×1080 (16:9), supports 16:10; **minimum 1280×720**; ultrawide letterboxes the scene (no stretched UI).
- **What sits where:** the **hand fan holds only your Dirty Trick cards** (and any card you're inspecting); **Corner fighters sit on the table edge** beside the ring. In **Lite the loadout is public, so the opponent's Corner and trick are face-up**; only their *lead choice* was secret. In **Full** the opponent's Corner and tricks are **face-down** until used.
- **Lite vs Full layouts must be drawn separately** (only a Lite-style sketch exists above; a Full sketch is still to do — 3 fighters, 2 Corner each side, 2 tricks).
- **Desktop interactions:** hover = lift + detail card (costs/damage/style), **keyboard 1–5** for actions, **Space/Enter = lock in**, Tab cycles switch targets, Esc cancels, optional **drag-to-slam**; subtle **mouse-parallax** on the camera; right-click inspects any revealed card.
- **Wallet:** desktop browsers have extension wallets (MetaMask/Rabby), so the *owner wallet* + scoped *session key* model (NFT_AND_CHAIN §3) is natural. No mobile-wallet deep-linking in v1.
- **Mobile portrait** (you at the bottom, opponent at the top) is a **later layout** over the same state; not part of v1 scope.
- **No haptics, no gyroscope** on desktop — removes the earlier iOS/Vibration-API risk.

## 4. The world (diegetic UI map)

| Game thing | Object in the world |
|---|---|
| Dirty Trick cards | A fan of cards in your hand (hover/drag to inspect); fighters are on the table (below) |
| Active fighter | **Standee** on your side of the chalk ring |
| Corner (bench) | Cards face-down at the table edge |
| **Grit** | **Matchsticks** — one per Grit; struck when spent, +1 each turn |
| **HP** | **Tally scratches** on the card edge; damage scars them |
| Dirty Trick | A face-down card under your palm, flipped with a flick |
| Turn clock | A **dripping tap / cheap kitchen timer** (sound + subtle bulb flicker) |
| Lock-in | A **bottle-cap token** slapped on a card; the opponent's shows only as a glow |
| The chain | **The Ledger** — a thick book; every confirmed tx writes a line with a stamp + block number. "On-chain" without wallet jargon |
| Auto playbook | A **napkin/clipboard**; rules **highlight as they fire** (wide shot) |
| Ladder | **The Wall** of scuffed photocopied posters |
| Fighter creation | **The Booking Room**: stool, height chart, **camera flash** that develops a Polaroid mugshot |
| Scars | **The Press**: a hand-cranked press re-prints your card with a new mark |

## 5. WOW moments (named milestones that drive build order)

| # | Moment | What happens | Cost |
|---|---|---|---|
| W1 | **The Flash** (Booking) | Flash; Polaroid develops to a silhouette while art loads, then swaps in the portrait; answers scrawled below | Low–med |
| W2 | **The Slam** (commit) | Token slap, table thud, bulb sways | Low |
| W3 | **The Flip** (reveal) | Silence → both flip; style-advantage ring flashes; camera push-in | Med |
| W4 | **The Hit** | Close-up crop, 3-frame impact inversion, hit-stop, dust, stencil damage number | Med |
| W5 | **The Press** (scar) | Card slides into the press, new scar stamped, ledger line added | Med |
| W6 | **Napkin Fight** (Auto) | Wide shot; playbook lines glow as rules fire | Med–high |

## 6. Rules for the UI
1. **Legibility beats diegesis.** HP, Grit, style matchup, the turn timer and **whether the opponent has locked in** *always* appear in the 2D overlay. Matches/tally/timer *reinforce* the numbers; they never replace them.
2. **Every gesture has a one-click or keyboard equivalent.**
3. **The renderer is a layer, not the game.** Game state + the shared TS engine + mock mode drive a **plain 2D view from hour one**; The Table renders the same state; the **Low tier is that 2D view, polished**; replays reuse whichever renderer is available. The 3D scene is never the single point of failure.
4. **Accessibility:** reduce-motion toggle, ≤ 3 flashes/s, colour-blind-safe style indicators (shape + colour), audio cues mirrored visually, adjustable text size.

## 7. Palette, type, materials (from the former VISUAL_DIRECTION)
| Token | Hex (start) | Use |
|---|---|---|
| `--toner` | `#0B0B0C` | backgrounds, heavy type |
| `--paper` | `#E9E4D8` | cards, posters (warm, never pure white) |
| `--tape` | `#FF5A1F` | primary action, danger, KO |
| `--bruise` | `#7A5CFF` | secondary + Monad nod; **only** in Ledger glow and highlights |
| `--smear` | `#8E8A7E` | dividers, ghost text, halftone |
| `--chalk` | `#F5F1E6` | ring, scratch marks |

Max 2 accents on screen; **no gold/neon, no glossy gradients.** **Type:** condensed grotesque/stencil display (Anton / Bebas Neue / Oswald / a stencil), typewriter/mono body (Space Mono / IBM Plex Mono), marker for hand-written notes; **avoid Bungee + Chakra Petch** (Street Aura's pair). **Materials:** halftone portraits, photocopier streaks, coffee rings, creases, staples, masking tape, cinder block, chain-link, hazard tape, stencilled numerals.
**Motion:** snap, don't glide (stop-motion feel, ~8–12 fps "boiling" textures); hit-stop 80–120 ms; shake with decay on big hits; type slams in with overshoot; reveals use a hard cut after one beat of silence.
**Sound:** foley first (cards on wood, chain, tap drip, concrete reverb); low drone + sparse sub percussion; tension riser in the commit window; **silence right before the flip**; ref's bell. Spatial audio (headphones/speakers).
**Voice:** terse, deadpan ("Ref says: wait for the bell."). No violence beyond stylised ink/impact frames; **no gore, no film names/quotes/logos.**

## 8. Art pipeline (user-made fighter → standee)
1. **Style-locked prompting:** the Booking answers fill a fixed template ("harsh on-camera flash, high-contrast black-and-white halftone xerox portrait, 1990s fight poster…") so every fighter belongs to the same world (the prompt controls *who*, not *style*, and never abilities).
2. Generate → **background removal** → threshold/halftone → optional **depth map** for parallax → pinned content-addressed (art hash on-chain).
3. Standee = cut-out plane with slight bend, paper-edge thickness, contact shadow; motion = squash/stretch, lunge, sway (no rig).
4. **Moderation:** block real-person names/likeness (booking-mugshots invite generating real people as criminals), NSFW, IP.
5. **Timing:** generation may exceed the W1 develop time → silhouette placeholder, swap when ready (never blocks play).
6. **Fallback:** hand-picked gallery of fighters + house fighters (PROMPTMON_TAKEAWAYS T3).

## 9. Cards as objects, wear as story
A procedural **wear shader** driven by on-chain data (`wins`, `losses`, scars mask, token seed): creases, tears, coffee rings, tape, ink — **identical for every viewer**. New cards are crisp; veterans look battered: the card is visibly a *career*.

## 10. Light, camera, post
One warm tungsten bulb (swinging) + faint cold fluorescent flicker; haze (billboard sprites + noise), dust motes. Camera: subtle handheld drift, breathing, push-ins on reveals, shake with decay (Promptmon's `CameraShaker` idea). Post: vignette, film grain, mild bloom, slight chromatic aberration on impact.

## 11. Performance & scope
- Stack: **React Three Fiber + drei + postprocessing** (Promptmon ran on R3F + bloom), KTX2 textures, one shadow-casting light.
- Target: **60 fps at 1080p on a laptop integrated GPU**; tiers: **High** (shadows, haze, full post) / **Medium** / **Low** (the 2D view). **Unmeasured** — validate with an early Table spike once the "no code yet" rule is lifted.
- **Hero scene first:** The Table fully (W2–W4) → Booking (W1) → Press (W5) → Napkin Fight (W6). Wall, Ledger page, Locker start as 2D overlays.
- Risks: GPU load on laptops, text legibility in 3D (§6), asset loading, AI cut-out quality, scope.

## 12. Originality (C1) — honest lineage
Against the brief's inspirations: Promptmon = dark violet void, bloom, 3D creatures; Street Aura = bright arcade UI, aura bars, gold/purple. Ours differs on both.
**Closer neighbours** (judges will name them): **Buckshot Roulette** (dark room, bare bulb, opponent across a table, items on the table) and **Inscryption** (first-person table, cards as objects, objects as resources). We cite them as lineage; what's ours: a **real-player** opponent, **standees on a chalk ring**, **secret simultaneous moves**, **record-driven card wear**, the **Ledger as the chain**, the Press, matchsticks, the napkin playbook. **Avoid one-to-one maps:** no damage scale, no candles for lives, no masked dealer as the framing.
Pitch line: *"If you know Buckshot Roulette or Inscryption, it's that tabletop tension — but against a real player, in a fight-club basement, where the cards remember every fight."*

## 13. Questions
1. Is the **side-on diorama** (you on the left, fighting-game style) right, or do you want the over-the-shoulder view across the table?
2. Are matches / tally / ledger / napkin the right language, or too cute?
3. Which two WOW moments are non-negotiable?
