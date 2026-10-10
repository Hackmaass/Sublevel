# Screenshots of the new features

Taken in headless Chrome (1920×1080 for the big screen, 390×844 @2x for phones). Folders are numbered in the order the features were built.
Regenerated whenever a feature changes — treat them as the current look, not a design spec.

| Folder | What it shows |
|---|---|
| `01-tutorial/` | **LEARN TO FIGHT** — the scripted first fight on the 3D table: coach note + glowing pointer (`lesson1`), the debrief after a lesson with "GOT IT" (`lesson3`, `lesson4`), the FIRST BLOOD graduation card. |
| `02-tape/` | The result screen with the **takeaway** line and **THE TAPE** (every turn: you / them / who read whom). |
| `03-room-projector/` | **THE ROOM** on the big screen: the window open with picks sealed (`window-open-sealed`), and the room's read of the last turn revealed one turn late (`heat-revealed`). |
| `04-room-phone/` | The spectator phone view (same-browser mock). |
| `05-venue-relay-qr/` | **Real phones via the relay + QR**: `01` title screen with the scan-to-join QR (it decodes to the machine's network address + room code) · `02`–`08` a phone joining, picking, getting SEALED, then its result after the reveal · `03` the QR stepping aside once a phone joined · `09` projector heat with a real phone on the leaderboard · `10`–`11` joining by typing the code. |
| `06-deploy-page/` | The `/deploy` page: connect a wallet, see the real cost, one transaction deploys everything. **These shots are from a local test chain, not the real deployment** (addresses shown are throw-away). |
| `07-onchain-duel/` | **The ON-CHAIN DUEL**: the button on the title, the setup modal (guest wallet + funding), the match with **THE LEDGER** (every tx: who, what, block, ms) and `chain = engine ✓`, and the result with the transaction count. *Run on a local chain with Monad's chain id; the real testnet shots are added after the live deploy.* |
| `08-mobile/` | Phone and small-window checks: the rotate-your-phone prompt (`m03`), the table in landscape with touch controls (`m04`), the spectator page and deploy page on a phone (`m05`–`m07`), a tablet (`m08`), and the 3D table filling a 1366×768 laptop window. |

Run it for real: `pnpm web:demo` (production build on every network interface, port 3000), open `http://localhost:3000` on the big screen — the QR shows the machine's network address.
