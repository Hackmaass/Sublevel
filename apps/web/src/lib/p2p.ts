"use client";

/**
 * Peer-to-peer room transport for the HOSTED build (Vercel has no shared server memory for the SSE relay).
 * The projector registers a peer id derived from the room code on PeerJS's free public signalling server; a phone opening the QR link
 * connects straight to it over WebRTC. Only the connection set-up goes through the signalling server — picks and snapshots flow
 * directly between the two devices. Same messages as the relay and BroadcastChannel transports; nothing here can touch a bout.
 */
import type { DataConnection, Peer } from "peerjs";

const peerId = (code: string) => `sublevel-room-${code}`;

export interface HostLink {
  /** send to every connected phone */
  broadcast(m: unknown): void;
  destroy(): void;
}

export interface HostHandlers {
  /** a phone sent a message; `reply` answers that phone only */
  onMessage(m: unknown, reply: (m: unknown) => void): void;
  /** a phone just connected: send it the current state */
  onConnect(reply: (m: unknown) => void): void;
  /** signalling server reachable and our id registered (the QR is only worth showing then) */
  onOnline(online: boolean): void;
  /** the code is already registered by someone else */
  onCodeTaken(): void;
}

/** Projector side: listen for phones. */
export function hostPeer(code: string, h: HostHandlers): HostLink {
  let dead = false;
  let peer: Peer | null = null;
  const conns = new Set<DataConnection>();
  let retries = 0;

  const start = async () => {
    const { Peer: P } = await import("peerjs");
    if (dead) return;
    const p = new P(peerId(code));
    peer = p;
    p.on("open", () => {
      retries = 0;
      h.onOnline(true);
    });
    p.on("disconnected", () => {
      h.onOnline(false);
      if (!dead && !p.destroyed) setTimeout(() => !dead && !p.destroyed && p.reconnect(), 1500);
    });
    p.on("error", (err) => {
      const type = (err as { type?: string }).type;
      if (type === "unavailable-id") {
        // our own previous peer may not have been released yet (a remount): retry the same id a few times, then give up the code
        p.destroy();
        if (retries++ < 3) setTimeout(() => !dead && void start(), 2000);
        else h.onCodeTaken();
      } else if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
        h.onOnline(false);
      }
    });
    p.on("connection", (c) => {
      c.on("open", () => {
        conns.add(c);
        h.onConnect((m) => c.open && c.send(m));
      });
      c.on("data", (d) => h.onMessage(d, (m) => c.open && c.send(m)));
      c.on("close", () => conns.delete(c));
      c.on("error", () => conns.delete(c));
    });
  };
  void start();

  return {
    broadcast(m) {
      for (const c of conns) if (c.open) c.send(m);
    },
    destroy() {
      dead = true;
      conns.clear();
      peer?.destroy();
    },
  };
}

export interface PhoneLink {
  send(m: unknown): boolean;
  destroy(): void;
}

/** Phone side: connect to the projector and keep reconnecting until it answers. */
export function joinPeer(code: string, onMessage: (m: unknown) => void, onConnected: (c: boolean) => void): PhoneLink {
  let dead = false;
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const again = (ms: number) => {
    if (dead) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void connect(), ms);
  };

  const connect = async () => {
    if (dead) return;
    try {
      if (!peer || peer.destroyed || peer.disconnected) {
        peer?.destroy();
        const { Peer: P } = await import("peerjs");
        if (dead) return;
        const p = new P();
        peer = p;
        await new Promise<void>((resolve, reject) => {
          p.on("open", () => resolve());
          p.on("error", reject); // before it opens: signalling server unreachable
        });
        // after it opens: "peer-unavailable" (the projector isn't there yet) and friends arrive here
        p.on("error", () => {
          onConnected(false);
          again(2000);
        });
        p.on("disconnected", () => {
          onConnected(false);
          again(1500);
        });
      }
      if (dead || !peer) return;
      const c = peer.connect(peerId(code), { reliable: true });
      conn = c;
      let opened = false;
      const giveUp = setTimeout(() => {
        if (!opened) {
          c.close();
          again(1000);
        }
      }, 8000);
      c.on("open", () => {
        opened = true;
        clearTimeout(giveUp);
        onConnected(true);
      });
      c.on("data", (d) => onMessage(d));
      c.on("close", () => {
        clearTimeout(giveUp);
        if (conn === c) {
          onConnected(false);
          again(1000);
        }
      });
      c.on("error", () => {
        clearTimeout(giveUp);
        onConnected(false);
        again(1500);
      });
    } catch {
      onConnected(false);
      again(2500);
    }
  };
  void connect();

  return {
    send(m) {
      if (!conn || !conn.open) return false;
      conn.send(m);
      return true;
    },
    destroy() {
      dead = true;
      if (timer) clearTimeout(timer);
      conn = null;
      peer?.destroy();
    },
  };
}
