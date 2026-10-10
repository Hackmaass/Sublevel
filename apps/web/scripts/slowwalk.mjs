// Capture the 3D reveal/impact frames under a slow software renderer:
//   node scripts/slowwalk.mjs [prefix] [slow=10]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const prefix = process.argv[2] ?? "slow";
const slow = process.argv[3] ?? "10";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/?q=low&slow=${slow}`, { waitUntil: "networkidle" });
await page.getByText("QUICK FIGHT").click();
await page.waitForTimeout(9000);
await page.keyboard.press("1");
await page.keyboard.press("Enter");
const t0 = Date.now();
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(Number(slow) * 700);
  await page.screenshot({ path: `shots/${prefix}-${i}.png`, timeout: 180000 });
  console.log("shot", i, "t=", Math.round((Date.now() - t0) / 1000), "s");
}
console.log(logs.slice(0, 15).join("\n") || "(no warnings)");
await browser.close();
