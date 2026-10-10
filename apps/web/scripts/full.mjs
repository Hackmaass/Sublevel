// Play a Full-format bout through the UI (flat renderer) until the replacement picker or the result appears.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => (m.type() === "error") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto((process.env.BASE_URL ?? "http://localhost:3000") + "/?r=2d", { waitUntil: "networkidle" });
await page.getByText("ENTER THE BASEMENT").click();
await page.waitForTimeout(600);
await page.getByText("FULL", { exact: false }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: "shots/full-1-lobby.png" });
await page.getByText("TO THE RING").click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/full-2-start.png" });
let seenPicker = false;
for (let turn = 0; turn < 30; turn++) {
  const over = await page.getByText(/YOU WIN|YOU LOSE|DRAW/).first().isVisible().catch(() => false);
  if (over) break;
  const picker = await page.getByText("YOUR FIGHTER IS DOWN").isVisible().catch(() => false);
  if (picker) {
    seenPicker = true;
    await page.screenshot({ path: "shots/full-3-picker.png" });
    await page.locator("button:has(canvas), button").filter({ hasText: /./ }).nth(0).waitFor({ timeout: 2000 }).catch(() => {});
    // click the first replacement poster
    await page.locator('div[style*="z-index: 45"] button').first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: "shots/full-4-after-pick.png" });
    continue;
  }
  const keys = ["1", "2", "3", "1", "T", "1"];
  await page.keyboard.press(keys[turn % keys.length]);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4600);
}
await page.waitForTimeout(2000);
await page.screenshot({ path: "shots/full-5-end.png" });
console.log("replacement picker seen:", seenPicker);
console.log(logs.slice(0, 10).join("\n") || "(no errors)");
await browser.close();
