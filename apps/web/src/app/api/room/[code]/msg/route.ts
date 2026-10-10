import { CODE_RE, fromPhone, type PhoneMsg } from "@/lib/relayStore";

const isClass = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 4;

/** a phone speaks. Strict, tiny validation: the host re-checks everything authoritatively. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!CODE_RE.test(code)) return Response.json({ ok: false, why: "bad code" }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > 2_000) return Response.json({ ok: false }, { status: 413 });
  let m: Record<string, unknown>;
  try {
    m = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const id = typeof m.id === "string" && m.id.length >= 6 && m.id.length <= 40 ? m.id : null;
  const name = typeof m.name === "string" ? m.name.replace(/[\u0000-\u001f<>]/g, "").slice(0, 18).trim() || "Spectator" : "Spectator";
  if (!id) return Response.json({ ok: false, why: "bad id" }, { status: 400 });
  let msg: PhoneMsg;
  if (m.t === "join") msg = { t: "join", id, name };
  else if (m.t === "pick" && Number.isInteger(m.turn) && Number.isInteger(m.epoch) && Array.isArray(m.pred) && m.pred.length === 2 && isClass(m.pred[0]) && isClass(m.pred[1]))
    msg = { t: "pick", id, name, turn: m.turn as number, epoch: m.epoch as number, pred: [m.pred[0] as number, m.pred[1] as number] };
  else return Response.json({ ok: false, why: "bad message" }, { status: 400 });
  return Response.json(fromPhone(code, msg));
}
