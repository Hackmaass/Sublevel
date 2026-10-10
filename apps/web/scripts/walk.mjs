// Walk the game and capture screenshots:  node scripts/walk.mjs [prefix]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const prefix = process.argv[2] ?? "walk";
const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const shot = async (name) => page.screenshot({ path: `shots/${prefix}-${name}.png`, timeout: 180000 });

await page.goto(base + "/" + (process.env.QUERY ?? ""), { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await shot("1-title");

await page.getByText("ENTER THE BASEMENT").click();
await page.waitForTimeout(1200);
await shot("2-lobby");

await page.getByText("TO THE RING").click();
await page.waitForTimeout(2200);
await shot("3-choose");

// pick the first legal attack and lock in
await page.keyboard.press("1");
await page.waitForTimeout(250);
await shot("4-selected");
await page.keyboard.press("Enter");
await page.waitForTimeout(1900);
await shot("5-reveal-down");
await page.waitForTimeout(1100);
await shot("6-reveal-flip");
await page.waitForTimeout(500);
await shot("7-impact");
await page.waitForTimeout(1800);
await shot("8-next");

// keep playing quickly until the bout ends (max 10 turns)
for (let i = 0; i < 10; i++) {
  const over = await page.getByText(/YOU WIN|YOU LOSE|DRAW/).first().isVisible().catch(() => false);
  if (over) break;
  await page.keyboard.press(i % 3 === 0 ? "3" : i % 2 === 0 ? "1" : "2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(Number(process.env.TURN_WAIT ?? 4800));
}
await page.waitForTimeout(2500);
await shot("9-end");
console.log(logs.slice(0, 25).join("\n") || "(no console warnings/errors)");
await browser.close();
