# Pitch — 3 minutes

> The rubric says to say all four **out loud**: **repo link · contract address · live URL · deployment (Monad Testnet)**. They're built into the opening and the close below. Fill the `⟨…⟩` slots from the README after the deploy.

## Before you go on stage (2 minutes of prep, checklist)
- [ ] Laptop on a **phone hotspot** (venue wifi blocks phones and slows RPC). `pnpm web:demo` is running; the projector shows the title screen with the **QR**.
- [ ] Guest wallet already funded (open ⛓ ON-CHAIN DUEL, check the balance ≥ 2.5 MON). **Don't fund it live.**
- [ ] Explorer tab open on the Arena address. One phone ready to scan.
- [ ] Fallback: a recorded run of the on-chain duel (`docs/screenshots/` + the demo video) if the RPC is down.

## Script

| Time | Say | Show |
|---|---|---|
| 0:00 | "**SUBLEVEL** is an underground card duel on Monad where every move is secret, a contract is the referee, and a whole room can read the fight live from their phones. Repo: **github.com/Hackmaass/Sublevel**. Live at **⟨live URL⟩**, deployed on **Monad Testnet**, Arena contract **⟨0x…⟩**." | Title screen, QR visible |
| 0:25 | "Two fighters seal a move at the same time. Nobody can see the other's, nobody can change theirs, and there's no server in the middle." | Press **⛓ ON-CHAIN DUEL** → START (already funded) |
| 0:45 | "That's a real transaction on Monad for every seal and every reveal. Watch the Ledger: who sent it, which block, and how fast it landed. About ⟨N⟩ ms." | Match running; point at **THE LEDGER** and `chain = engine ✓` |
| 1:25 | "The contract resolves the turn, and my TypeScript engine has to agree with it, every turn, or the screen flags it." | A reveal + hit animation |
| 1:50 | "The room. Scan this." *(phone scan)* "They're reading the fight: what will each fighter do next? Picks are sealed, so the fighters can't use the crowd, and they're revealed a turn late. Points only: the crowd can never touch the result." | Phone join → predict → heat bars + "THE ROOM CALLED IT" |
| 2:25 | "Why Monad: sub-second blocks turn a per-turn on-chain mind game from a minute a turn into seconds. And each card remembers: its record is written only by the Arena, so nobody can edit a career." | Result screen → open the Arena / a tx on the explorer |
| 2:45 | "Free to play, fight-club look is the product. We'd earn from event licensing of The Room, cosmetics and sponsored belts. Never pay-to-win, no betting." | — |
| 2:55 | "Repo **github.com/Hackmaass/Sublevel**, live **⟨live URL⟩**, Arena **⟨0x…⟩**, on Monad Testnet. Thank you." | Title screen |

## Honest answers to the questions you'll get
- **"Is the opponent a person?"** In this demo it's a house bot with its own wallet, so nobody needs a wallet to play. A person-vs-person challenge is in the contracts (`createChallenge` / `acceptChallenge`, plus a ranked queue); the UI for that isn't built yet.
- **"Is the room on-chain?"** Not yet. Its scoring runs in the host browser and is labelled off-chain. The sealed-pick design and a `Crowd` contract are specified; only points would ever be at stake.
- **"What's not done?"** Full 3v3 format in the UI, ranked/Belt UI, Auto playbooks, AI portraits, a mainnet deploy, an audit.
- **"Why a guest wallet?"** So a stranger can play in 10 seconds with no extension. It's a throw-away key in the browser holding testnet MON; real wallets are used to fund it and to deploy.
- **"Can the crowd cheat?"** An alt wallet can predict perfectly, which is exactly why points and cosmetics are the only reward.
- **"Anything pre-written?"** *(Be upfront.)* The design docs, rules engine and contracts were written in the two days before the event; the web UI, the tutorial, the room, the venue QR relay, the deploy page and the on-chain duel were built on the day. The git history shows real timestamps.
