import { CODE_RE, attachHost, sse } from "@/lib/relayStore";

/** the projector listens for what phones say (join / pick) */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!CODE_RE.test(code) || key.length < 8 || key.length > 64) return new Response("bad request", { status: 400 });
  return sse(request, (sink) => attachHost(code, key, sink));
}
