import { CODE_RE, publish } from "@/lib/relayStore";

/** the projector pushes its latest room snapshot (the first publisher owns the code) */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const key = request.headers.get("x-host-key") ?? "";
  if (!CODE_RE.test(code) || key.length < 8 || key.length > 64) return Response.json({ ok: false }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) return Response.json({ ok: false }, { status: 413 });
  let snap: unknown;
  try {
    snap = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof snap !== "object" || snap === null) return Response.json({ ok: false }, { status: 400 });
  return publish(code, key, snap as Record<string, unknown>) ? Response.json({ ok: true }) : Response.json({ ok: false, why: "code owned by another screen" }, { status: 403 });
}
