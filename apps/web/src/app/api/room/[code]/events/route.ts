import { CODE_RE, attachPhone, sse } from "@/lib/relayStore";

/** a phone listens: the latest snapshot now, every update after */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!CODE_RE.test(code)) return new Response("bad code", { status: 400 });
  return sse(request, (sink) => attachPhone(code, sink));
}
