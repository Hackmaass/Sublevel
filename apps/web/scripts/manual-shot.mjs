// Screenshot the in-game manual pages:  node scripts/manual-shot.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto((process.env.BASE_URL ?? "http://localhost:3000") + "/?r=2d", { waitUntil: "networkidle" });
await page.getByText("ENTER THE BASEMENT").click(); // first visit → manual auto-opens
await page.waitForTimeout(1200);
const opened = await page.getByText("KNOCK THEM OUT.").isVisible();
console.log("auto-opened on first visit:", opened);
const pages = ["THE GOAL", "GUARD TRIANGLE", "STYLES & RIDERS", "THE CARDS", "FORMATS"];
for (const [i, t] of pages.entries()) {
  await page.locator("button", { hasText: t }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/manual-${i}-${t.replace(/\W+/g, "_")}.png` });
}
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log("closed with Esc:", !(await page.getByText("THE HOUSE RULES").isVisible().catch(() => false)));
console.log(logs.join("\n") || "(no errors)");
await browser.close();
