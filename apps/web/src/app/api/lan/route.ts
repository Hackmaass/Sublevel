import { networkInterfaces } from "node:os";

/** the addresses a phone on the same network can reach this machine at (the projector needs one for its QR code) */
export async function GET(request: Request) {
  const port = new URL(request.url).port || "3000";
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) out.push(i.address); // 169.254 = link-local: no phone can use it
  }
  // genuine private ranges (home / office / hotspot) first; odd ranges (VPN adapters such as 26.x) last
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 : ip.startsWith("10.") ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b));
  return Response.json({ port, addresses: out });
}
