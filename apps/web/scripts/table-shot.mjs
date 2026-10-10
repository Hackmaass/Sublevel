// node scripts/table-shot.mjs <out.png> [query] [wait-ms]   → quick fight, then screenshot the table
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [out = "shots/table.png", query = "", wait = "3500"] = process.argv.slice(2);
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto((process.env.BASE_URL ?? "http://localhost:3000") + "/" + query, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.getByText("QUICK FIGHT").click();
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, timeout: 180000 });
console.log(logs.filter((l) => !l.includes("DevTools") && !l.includes("HMR")).slice(0, 25).join("\n") || "(clean)");
await browser.close();
