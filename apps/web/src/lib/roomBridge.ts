"use client";

/**
 * Transport between the projector (the big screen running the game) and spectator phones (`/watch`).
 *   • RELAY (real phones): the projector POSTs snapshots to `/api/room/<code>/state` and listens on an SSE stream; phones open
 *     `/watch?room=<code>` (the QR code), listen on SSE and POST their picks. Needs the Next server running on a machine the
 *     phones can reach (same network, hotspot, or a tunnel). Points are tallied in this browser, off-chain: a MOCK referee.
 *   • LOCAL (no code): BroadcastChannel between tabs of ONE browser — a phone-sized window on the same machine.
 * Either way the phone only ever talks to the projector; nothing here can touch a bout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Prediction } from "@sublevel/engine";
import { useGame } from "./game";
import { useRoom } from "./room";

export const ROOM_CHANNEL = "sublevel-room";

export interface RoomSnapshot {
  live: boolean;
  epoch: number;
  /** history index of the open (or last) window — a pick must name it */
  turn: number;
  open: boolean;
  locked: number;
  total: number;
  fighters: { name: string; style: number; hp: number; maxHp: number }[];
  board: { id: string; name: string; points: number; human: boolean }[];
  /** every human spectator's own score and rank over the WHOLE room (the board above is only the top few) */
  humans: { id: string; points: number; rank: number }[];
  /** the last revealed turn: what the fighters played, and the room's share for each class */
  last: { turn: number; actual: [number, number]; heat: [number[], number[]] } | null;
  results: Record<string, number>;
}

type ToProjector = { t: "hello" } | { t: "join"; id: string; name: string } | { t: "pick"; id: string; name: string; turn: number; epoch: number; pred: Prediction };
type ToPhone = { t: "state"; snap: RoomSnapshot } | { t: "ack"; id: string; turn: number; ok: boolean };

function snapshot(): RoomSnapshot {
  const g = useGame.getState();
  const r = useRoom.getState();
  const bout = g.bout;
  const fighters = bout
    ? ([0, 1] as const).map((side) => {
        const s = bout.sides[side];
        const f = s.fighters[s.active]!;
        return { name: g.meta.name[side][s.active] ?? "???", style: f.build.style, hp: f.hp, maxHp: f.maxHp };
      })
    : [];
  const lastTurn = r.turns[r.turns.length - 1];
  const ranked = [...r.spectators].sort((a, b) => b.points - a.points);
  return {
    live: g.screen === "match" && !!bout && !g.tutorial && r.on,
    epoch: r.epoch,
    turn: r.windowTurn,
    open: r.windowOpen,
    locked: r.locked,
    total: r.spectators.length,
    fighters,
    board: ranked.slice(0, 12).map(({ id, name, points, human }) => ({ id, name, points, human })),
    humans: ranked.flatMap((s, i) => (s.human ? [{ id: s.id, points: s.points, rank: i + 1 }] : [])),
    last: lastTurn ? { turn: lastTurn.turn, actual: lastTurn.actual, heat: lastTurn.heat } : null,
    results: r.lastResults,
  };
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: readable from across a room
const randomCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const randomKey = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");

function session(key: string, make: () => string): string {
  try {
    const v = sessionStorage.getItem(key);
    if (v) return v;
    const n = make();
    sessionStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}

/** Projector side: answer phones (relay + same-browser) and keep them in sync. Returns the cleanup. */
export function startProjectorBridge(): () => void {
  let dead = false;
  const hostKey = session("sublevel.room.hostkey", randomKey);
  let code = session("sublevel.room.code", randomCode);
  useRoom.setState({ code });

  const handle = (m: ToProjector, reply?: (m: ToPhone) => void) => {
    const room = useRoom.getState();
    if (m.t === "join") room.join(m.id, m.name);
    else if (m.t === "pick") {
      room.join(m.id, m.name);
      // the projector is authoritative: right bout, right turn, window open, first lock only
      const ok = m.epoch === room.epoch && room.submit(m.id, m.turn, m.pred);
      reply?.({ t: "ack", id: m.id, turn: m.turn, ok });
    }
    push();
  };

  /* ---- same-browser phones ---- */
  const ch = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(ROOM_CHANNEL) : null;
  if (ch) {
    ch.onmessage = (e: MessageEvent<ToProjector>) => {
      if (e.data.t === "hello") push();
      else handle(e.data, (m) => ch.postMessage(m));
    };
  }

  /* ---- relay (real phones) ---- */
  let es: EventSource | null = null;
  const connectHost = () => {
    es?.close();
    es = new EventSource(`/api/room/${code}/host?key=${hostKey}`);
    es.addEventListener("msg", (ev) => {
      try {
        handle(JSON.parse((ev as MessageEvent<string>).data) as ToProjector);
      } catch {
        /* ignore a malformed message */
      }
    });
  };
  const publish = async () => {
    try {
      const res = await fetch(`/api/room/${code}/state`, { method: "POST", headers: { "content-type": "application/json", "x-host-key": hostKey }, body: JSON.stringify(snapshot()) });
      if (dead) return;
      if (res.status === 403) {
        // someone else owns this code: take a fresh one
        code = randomCode();
        try {
          sessionStorage.setItem("sublevel.room.code", code);
        } catch {
          /* ignore */
        }
        useRoom.setState({ code });
        connectHost();
        return;
      }
      useRoom.setState({ relay: res.ok ? "online" : "offline" });
    } catch {
      if (!dead) useRoom.setState({ relay: "offline" });
    }
  };

  let pending: ReturnType<typeof setTimeout> | null = null;
  function push() {
    if (pending || dead) return;
    pending = setTimeout(() => {
      pending = null;
      ch?.postMessage({ t: "state", snap: snapshot() } satisfies ToPhone);
      void publish();
    }, 150);
  }

  connectHost();
  const subs = [useRoom.subscribe(push), useGame.subscribe(push)];
  const hb = setInterval(push, 1500);
  push();
  return () => {
    dead = true;
    subs.forEach((u) => u());
    clearInterval(hb);
    if (pending) clearTimeout(pending);
    es?.close();
    ch?.close();
  };
}

const ID_KEY = "sublevel.room.id";
const NAME_KEY = "sublevel.room.name";

function stored(key: string, make: () => string): string {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const n = make();
    localStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}

/** Phone side. `picked` is the turn this phone has already locked a pick for. */
export function useRemoteRoom() {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  // browser-only values are read AFTER mount (the page is prerendered), so server and client render the same first frame
  const [id, setId] = useState("");
  const [name, setNameState] = useState("");
  const [code, setCode] = useState<string | null | undefined>(undefined); // undefined = not read yet
  const [picked, setPicked] = useState<number | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const epoch = useRef(-1);
  const ch = useRef<BroadcastChannel | null>(null);
  const nameRef = useRef("");
  nameRef.current = name;

  useEffect(() => {
    setId(stored(ID_KEY, () => `human:${Math.random().toString(36).slice(2, 10)}`));
    setNameState(stored(NAME_KEY, () => `Spectator ${Math.floor(1000 + Math.random() * 9000)}`));
    const c = new URLSearchParams(window.location.search).get("room");
    setCode(c ? c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : null);
  }, []);

  const take = useCallback((s: RoomSnapshot) => {
    if (s.epoch !== epoch.current) {
      epoch.current = s.epoch;
      setPicked(null);
      setRejected(null);
    }
    setSnap(s);
  }, []);

  const post = useCallback(
    async (body: object): Promise<{ ok: boolean; why?: string }> => {
      try {
        const res = await fetch(`/api/room/${code}/msg`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return (await res.json()) as { ok: boolean; why?: string };
      } catch {
        return { ok: false, why: "no connection" };
      }
    },
    [code],
  );

  // --- relay mode: SSE in, POST out ---
  const ready = !!id && !!name;
  useEffect(() => {
    if (!code || !ready) return;
    const es = new EventSource(`/api/room/${code}/events`);
    es.onopen = () => {
      setConnected(true);
      void post({ t: "join", id, name: nameRef.current });
    };
    es.onerror = () => setConnected(false);
    es.addEventListener("state", (ev) => {
      try {
        take(JSON.parse((ev as MessageEvent<string>).data) as RoomSnapshot);
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [code, id, ready, take, post]);

  // --- local mode: BroadcastChannel between tabs of this browser ---
  useEffect(() => {
    if (code !== null || !ready || typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(ROOM_CHANNEL);
    ch.current = c;
    c.onmessage = (e: MessageEvent<ToPhone>) => {
      const m = e.data;
      if (m.t === "state") {
        setConnected(true);
        take(m.snap);
      } else if (m.t === "ack" && m.id === id) {
        if (m.ok) setPicked(m.turn);
        else setRejected("too late");
      }
    };
    c.postMessage({ t: "join", id, name: nameRef.current } satisfies ToProjector);
    c.postMessage({ t: "hello" } satisfies ToProjector);
    const again = setInterval(() => c.postMessage({ t: "hello" } satisfies ToProjector), 2500);
    return () => {
      clearInterval(again);
      c.close();
      ch.current = null;
    };
  }, [code, id, ready, take]);

  const setName = useCallback(
    (n: string) => {
      setNameState(n);
      try {
        localStorage.setItem(NAME_KEY, n);
      } catch {
        /* storage may be unavailable */
      }
      if (code) void post({ t: "join", id, name: n });
      else ch.current?.postMessage({ t: "join", id, name: n } satisfies ToProjector);
    },
    [code, id, post],
  );

  const pick = useCallback(
    async (turn: number, pred: Prediction) => {
      setRejected(null);
      const e = snap?.epoch ?? 0;
      if (code) {
        const r = await post({ t: "pick", id, name, turn, epoch: e, pred });
        if (r.ok) setPicked(turn);
        else setRejected(r.why ?? "rejected");
      } else ch.current?.postMessage({ t: "pick", id, name, turn, epoch: e, pred } satisfies ToProjector);
    },
    [code, id, name, post, snap?.epoch],
  );

  return { snap, id, name, setName, pick, picked, rejected, code, connected };
}
