import "server-only";

/**
 * The venue relay: an in-memory room per code, held by the Next server process.
 *   projector (host) ──POST snapshots──▶ room ──SSE──▶ phones
 *   phones ──POST join/pick──▶ room ──SSE──▶ projector (host)
 *
 * It is a MOCK referee for the crowd layer, on purpose: the points it tallies are off-chain and unverifiable (the real thing is the
 * on-chain Crowd contract). It holds no wallet, no key and no money. State lives in this process, so it works for `next dev` /
 * `next start` on a laptop (phones on the same network, or through a tunnel) — NOT on serverless hosting.
 */

export interface Sink {
  send(event: string, data: unknown): void;
}

interface Snapshot {
  live?: boolean;
  open?: boolean;
  turn?: number;
  epoch?: number;
  [k: string]: unknown;
}

interface Room {
  code: string;
  hostKey: string;
  snapshot: Snapshot | null;
  touched: number;
  phones: Set<Sink>;
  hosts: Set<Sink>;
  /** id → the turn this phone already locked (write-once per turn, like a commit) */
  picked: Map<string, number>;
  epoch: number;
}

const g = globalThis as unknown as { __sublevelRooms?: Map<string, Room> };
const rooms = (g.__sublevelRooms ??= new Map<string, Room>());

const TTL_MS = 30 * 60 * 1000;
export const CODE_RE = /^[A-Z0-9]{4,8}$/;

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > TTL_MS && r.phones.size === 0 && r.hosts.size === 0) rooms.delete(code);
}

export function roomCount(): number {
  return rooms.size;
}

function ensure(code: string, hostKey: string): Room | null {
  sweep();
  let r = rooms.get(code);
  if (!r) {
    r = { code, hostKey, snapshot: null, touched: Date.now(), phones: new Set(), hosts: new Set(), picked: new Map(), epoch: -1 };
    rooms.set(code, r);
  }
  return r.hostKey === hostKey ? r : null; // the first publisher owns the code
}

/** the host pushes the latest snapshot; every phone gets it */
export function publish(code: string, hostKey: string, snap: Snapshot): boolean {
  const r = ensure(code, hostKey);
  if (!r) return false;
  r.touched = Date.now();
  if (typeof snap.epoch === "number" && snap.epoch !== r.epoch) {
    r.epoch = snap.epoch;
    r.picked.clear(); // a new bout: turn numbers restart
  }
  r.snapshot = snap;
  for (const p of r.phones) p.send("state", snap);
  return true;
}

export function attachPhone(code: string, sink: Sink): (() => void) | null {
  const r = rooms.get(code);
  if (!r) return null;
  r.phones.add(sink);
  if (r.snapshot) sink.send("state", r.snapshot);
  return () => r.phones.delete(sink);
}

export function attachHost(code: string, hostKey: string, sink: Sink): (() => void) | null {
  const r = ensure(code, hostKey);
  if (!r) return null;
  r.hosts.add(sink);
  return () => r.hosts.delete(sink);
}

export type PhoneMsg = { t: "join"; id: string; name: string } | { t: "pick"; id: string; name: string; turn: number; epoch: number; pred: [number, number] };

/** a phone speaks: validate cheaply here (so the answer is immediate), forward to the host, which re-validates authoritatively */
export function fromPhone(code: string, msg: PhoneMsg): { ok: boolean; why?: string } {
  const r = rooms.get(code);
  if (!r) return { ok: false, why: "no such room" };
  r.touched = Date.now();
  if (r.hosts.size === 0) return { ok: false, why: "the big screen is offline" };
  if (msg.t === "join") {
    for (const h of r.hosts) h.send("msg", msg);
    return { ok: true };
  }
  const s = r.snapshot;
  if (!s || !s.live || !s.open) return { ok: false, why: "window shut" };
  if (msg.turn !== s.turn || msg.epoch !== s.epoch) return { ok: false, why: "stale turn" };
  if (r.picked.get(msg.id) === msg.turn) return { ok: false, why: "already locked" };
  r.picked.set(msg.id, msg.turn);
  for (const h of r.hosts) h.send("msg", msg);
  return { ok: true };
}

/** Server-Sent Events response; `attach` wires a Sink and returns its cleanup (or null → 404) */
export function sse(request: Request, attach: (sink: Sink) => (() => void) | null): Response {
  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* stream already closed */
        }
      };
      const sink: Sink = { send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) };
      cleanup = attach(sink);
      if (!cleanup) {
        controller.close();
        return;
      }
      write("retry: 1500\n\n");
      ping = setInterval(() => write(": ping\n\n"), 15000);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      clearInterval(ping);
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
