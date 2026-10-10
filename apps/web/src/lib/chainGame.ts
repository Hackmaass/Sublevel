"use client";

/**
 * ON-CHAIN DUEL (browser side). The player gets a GUEST WALLET — a key generated in this browser and funded once (from MetaMask or the
 * faucet) — so every game transaction is signed with no popup and nobody needs a wallet of their own to play. The opponent is the HOUSE:
 * a second guest wallet in this browser, played by the equilibrium bot. Everything between them is a real transaction on Monad testnet.
 *
 * The guest/house keys are THROW-AWAY keys holding a few testnet MON. They live in this browser's localStorage and nowhere else; nothing
 * about the project ever asks for, stores or sends a user's real wallet key.
 */
import { create } from "zustand";
import { createWalletClient, custom, formatEther, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Actor, TAG, houseLoop, playLead, presetName, readRevealedAction, startDuel, waitFor, type Duel, type TxLog } from "@sublevel/chain";
import type { Action, BoutState } from "@sublevel/engine";
import { DEPLOYMENT, type Deployment } from "./deployments";
import { isLocalChain, makeTransport, monadTestnet, publicClient } from "./monad";
import { ensureMonadTestnet, walletError, type WalletInfo } from "./wallets";
import { useGame, type ChainDriver } from "./game";

const KEY_GUEST = "sublevel.guest.key";
const KEY_HOUSE = "sublevel.house.key";
const KEY_POOL_YOU = "sublevel.pool.you";
const KEY_POOL_HOUSE = "sublevel.pool.house";

/** what a duel costs the guest wallet: the house bot's float + this bot's own gas for a bout (gas LIMITS are charged on Monad) */
export const HOUSE_FLOAT = parseEther("1");
export const GUEST_NEEDS = parseEther("2.5");
const HOUSE_MIN = parseEther("0.6");

const YOU = { a: 0, b: 3, trick: 0 }; // Rust Dog + Sister Nails + Cheap Shot
const HOUSE = { a: 6, b: 4, trick: 3 }; // The Accountant + Ivan the Vice + Smoke Bomb

function ls(key: string, set?: string): string | null {
  try {
    if (set !== undefined) localStorage.setItem(key, set);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadKey(name: string): Hex {
  const have = ls(name);
  if (have && /^0x[0-9a-fA-F]{64}$/.test(have)) return have as Hex;
  const k = generatePrivateKey();
  ls(name, k);
  return k;
}

/** the browser's guest wallet key (created on first use) */
export const getGuestKey = (): Hex => loadKey(KEY_GUEST);

export function getDeployment(): Deployment | null {
  // pointed at a LOCAL node (`?rpc=`, for testing): the baked-in testnet addresses would not exist there, so a local deployment wins
  if (DEPLOYMENT && !isLocalChain) return DEPLOYMENT;
  try {
    const raw = localStorage.getItem("sublevel.deployment"); // written by the /deploy page on the machine that deployed
    const d = raw ? (JSON.parse(raw) as Deployment) : null;
    return d && d.chainId === 10143 && d.arena ? d : null;
  } catch {
    return null;
  }
}

interface ChainState {
  deployment: Deployment | null;
  guest: Address | null;
  balance: bigint | null;
  houseBalance: bigint | null;
  ledger: TxLog[];
  setupOpen: boolean;
  running: boolean;
  steps: string[];
  error: string | null;
  boutId: string | null;
  init(): void;
  openSetup(): void;
  closeSetup(): void;
  refresh(): Promise<void>;
  fundFromWallet(w: WalletInfo, mon: string): Promise<void>;
  resetGuest(): void;
  start(): Promise<void>;
}

let duel: Duel | null = null;
let houseStop = false;

export const useChain = create<ChainState>((set, get) => ({
  deployment: null,
  guest: null,
  balance: null,
  houseBalance: null,
  ledger: [],
  setupOpen: false,
  running: false,
  steps: [],
  error: null,
  boutId: null,

  init() {
    const deployment = getDeployment();
    const guest = privateKeyToAccount(loadKey(KEY_GUEST)).address;
    set({ deployment, guest });
    void get().refresh();
  },
  openSetup() {
    get().init();
    set({ setupOpen: true, error: null });
  },
  closeSetup: () => set({ setupOpen: false }),

  async refresh() {
    const guest = get().guest;
    if (!guest) return;
    const house = privateKeyToAccount(loadKey(KEY_HOUSE)).address;
    try {
      const [balance, houseBalance] = await Promise.all([publicClient.getBalance({ address: guest }), publicClient.getBalance({ address: house })]);
      set({ balance, houseBalance });
    } catch (e) {
      set({ error: `Could not read balances: ${(e as Error).message}` });
    }
  },

  /** top the guest wallet up from the player's own wallet (one popup) */
  async fundFromWallet(w, mon) {
    const guest = get().guest;
    if (!guest) return;
    set({ error: null });
    try {
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(w.provider) });
      const [from] = await wc.requestAddresses();
      await ensureMonadTestnet(w);
      const hash = await wc.sendTransaction({ account: from!, to: guest, value: parseEther(mon), gas: 21000n });
      await publicClient.waitForTransactionReceipt({ hash });
      await get().refresh();
    } catch (e) {
      set({ error: walletError(e, w) });
    }
  },

  resetGuest() {
    for (const k of [KEY_GUEST, KEY_HOUSE, KEY_POOL_YOU, KEY_POOL_HOUSE]) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    set({ guest: null, balance: null, houseBalance: null, steps: [], error: null });
    get().init();
  },

  async start() {
    const d = get().deployment ?? getDeployment();
    if (!d) return set({ error: "The contracts are not deployed yet — open /deploy first." });
    if (get().running) return;
    houseStop = true; // a previous duel's house bot stops
    set({ running: true, error: null, steps: [], ledger: [], deployment: d });
    const step = (s: string) => set((st) => ({ steps: [...st.steps, s] }));
    try {
      const addrs = { arena: d.arena, armory: d.armory, cards: d.cards };
      const mk = (who: "you" | "house", key: Hex) =>
        new Actor(who, publicClient, createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: makeTransport() }), addrs, (t) => set((st) => ({ ledger: [...st.ledger, t] })));
      const you = mk("you", loadKey(KEY_GUEST));
      const house = mk("house", loadKey(KEY_HOUSE));

      const [mine, theirs] = await Promise.all([publicClient.getBalance({ address: you.address }), publicClient.getBalance({ address: house.address })]);
      if (theirs < HOUSE_MIN) {
        if (mine < GUEST_NEEDS) throw new Error(`Your guest wallet needs about ${formatEther(GUEST_NEEDS)} MON (it has ${Number(formatEther(mine)).toFixed(2)}).`);
        step("Funding the house bot's wallet");
        await you.transfer("fund house bot", house.address, HOUSE_FLOAT);
      } else if (mine < parseEther("1.2")) throw new Error(`Your guest wallet is low (${Number(formatEther(mine)).toFixed(2)} MON). Top it up first.`);

      const remembered = (k: string) => {
        const v = ls(k);
        return v && /^\d+$/.test(v) ? BigInt(v) : undefined;
      };
      duel = await startDuel({
        you,
        house,
        youPresets: YOU,
        housePresets: HOUSE,
        remembered: { you: remembered(KEY_POOL_YOU), house: remembered(KEY_POOL_HOUSE) },
        onPool: (who, id) => ls(who === "you" ? KEY_POOL_YOU : KEY_POOL_HOUSE, String(id)), // resumable: remember a pool the moment it exists
        step,
      });
      ls(KEY_POOL_YOU, String(duel.poolYou));
      ls(KEY_POOL_HOUSE, String(duel.poolHouse));
      set({ boutId: String(duel.boutId) });

      houseStop = false;
      const myDuel = duel;
      void houseLoop({ seat: myDuel.house, side: 1, actor: house, stop: () => houseStop || duel !== myDuel, onError: (e) => console.warn("house:", e) });
      step("Both sides seal their leads");
      await playLead(myDuel.you, 0);
      const view = await myDuel.you.view();
      if (!view) throw new Error("the bout did not start");

      // RESUMABLE: if a network hiccup interrupts a turn, retrying must reuse the move already sealed on chain (a different move would
      // fail the reveal and forfeit) and skip the steps already done.
      const sealed = new Map<number, Action>();
      const driver: ChainDriver = {
        async playTurn(before, chosen, hooks) {
          const seat = myDuel.you;
          const turn = before.turn;
          const mine = sealed.get(turn) ?? chosen;
          const m0 = await seat.meta();
          if (m0.phase === "TurnCommit" && !m0.committed[0]) {
            sealed.set(turn, mine);
            await seat.commit(TAG.ACTION, turn, mine);
          }
          await waitFor(seat, (m) => m.phase !== "TurnCommit"); // the house has sealed too
          hooks.onOppLocked();
          const m1 = await seat.meta();
          if (m1.phase === "TurnReveal" && !m1.revealed[0]) await seat.reveal(TAG.ACTION, turn, mine);
          await waitFor(seat, (m) => m.phase !== "TurnReveal"); // the turn has resolved
          const theirs = await readRevealedAction(publicClient, d.arena, myDuel.boutId, 1);
          const v = await seat.view();
          if (!v) throw new Error("no state after the turn");
          return { mine, theirs: (theirs ?? 2) as Action, state: v.state };
        },
        async replace(state: BoutState, slot: number) {
          const seat = myDuel.you;
          const m0 = await seat.meta();
          if (m0.mustAct[0]) {
            await seat.commit(TAG.REPLACE, state.turn, slot);
            await waitFor(seat, (m) => m.phase !== "ReplaceCommit");
            await seat.reveal(TAG.REPLACE, state.turn, slot);
          }
          await waitFor(seat, (m) => m.phase === "TurnCommit" || m.phase === "Over");
          const v = await seat.view();
          if (!v) throw new Error("no state after the replacement");
          return v.state;
        },
      };

      const names: [string[], string[]] = [[presetName(YOU.a), presetName(YOU.b)], [presetName(HOUSE.a), presetName(HOUSE.b)]];
      const seeds: [number[], number[]] = [[YOU.a + 1, YOU.b + 1], [HOUSE.a + 1, HOUSE.b + 1]];
      set({ setupOpen: false });
      useGame.getState().startChainMatch(view.state, names, seeds, driver);
    } catch (e) {
      const raw = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      set({ error: /429|rate.?limit|too many requests/i.test(raw) ? "The public Monad RPC is rate-limiting this connection. Wait about 20 seconds and press START again: setup resumes where it stopped." : raw });
    } finally {
      set({ running: false });
      void get().refresh();
    }
  },
}));

// leaving the match (title, lobby, a new fight) stops the house bot
if (typeof window !== "undefined") {
  useGame.subscribe((s, prev) => {
    if (prev.chain && !s.chain) houseStop = true;
  });
}
