"use client";

/**
 * WALLET SIGN-IN (client-side only). The player picks a wallet (EIP-6963), approves `eth_requestAccounts`, and signs a short message.
 * The signature is checked in the browser and the address is remembered in localStorage — there is NO server, session or cookie, so
 * this is a name tag ("who am I"), not access control. Signing costs no gas and needs no network switch.
 *
 * What it does NOT do: the key that FIGHTS is the browser's guest key (it signs every move with no popup), so belts and ratings accrue to
 * the guest address. The profile shows both, side by side, rather than pretending they are the same account.
 */
import { create } from "zustand";
import { verifyMessage, toHex, type Address, type Hex } from "viem";
import { rememberWallet, walletError, type WalletInfo } from "./wallets";

const KEY = "sublevel.account";

export interface Account {
  address: Address;
  wallet: string;
}

const read = (): Account | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Account | null;
    return v && /^0x[0-9a-fA-F]{40}$/.test(v.address) ? v : null;
  } catch {
    return null;
  }
};
const write = (a: Account | null) => {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable */
  }
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const message = (address: string) =>
  `SUBLEVEL sign-in\n\nI am ${address}.\nThis proves I control this wallet. It is not a transaction and costs no gas.`;

interface AccountState {
  account: Account | null;
  loginOpen: boolean;
  busy: boolean;
  error: string | null;
  /** read after mount (browser-only storage), so server and client render the same first frame */
  hydrate(): void;
  openLogin(): void;
  closeLogin(): void;
  signIn(w: WalletInfo): Promise<void>;
  signOut(): void;
}

export const useAccount = create<AccountState>((set) => ({
  account: null,
  loginOpen: false,
  busy: false,
  error: null,
  hydrate: () => set({ account: read() }),
  openLogin: () => set({ loginOpen: true, error: null }),
  closeLogin: () => set({ loginOpen: false }),
  async signIn(w) {
    set({ busy: true, error: null });
    try {
      const accounts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0] as Address | undefined;
      if (!address) throw new Error("The wallet returned no account.");
      const msg = message(address);
      const signature = (await w.provider.request({ method: "personal_sign", params: [toHex(msg), address] })) as Hex;
      const ok = await verifyMessage({ address, message: msg, signature }).catch(() => false);
      if (!ok) throw new Error("The wallet's signature did not check out. Try again, or pick another wallet.");
      const account = { address, wallet: w.name };
      rememberWallet(w.id);
      write(account);
      set({ account, loginOpen: false });
    } catch (e) {
      set({ error: walletError(e, w) });
    } finally {
      set({ busy: false });
    }
  },
  signOut() {
    write(null);
    set({ account: null });
  },
}));
