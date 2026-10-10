// Screenshot + exercise the Workbench:  node scripts/workbench-shot.mjs   (dev server on :3000)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto((process.env.BASE_URL ?? "http://localhost:3000") + "/?r=2d", { waitUntil: "networkidle" });
await page.getByText("ENTER THE BASEMENT").click();
await page.waitForTimeout(800);
await page.keyboard.press("Escape"); // close the auto-opened manual
await page.waitForTimeout(400);
await page.getByText("PICK YOUR CORNER").waitFor({ timeout: 8000 }).catch(() => {});
await page.screenshot({ path: "shots/lobby-house.png" });
await page.getByText(/^YOURS/).click();
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/lobby-yours-empty.png" });
await page.getByText("+ BUILD").click();
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/workbench-0.png" });
// invalid then valid name
await page.locator("input").fill("Bad<>Name");
const stampDisabled = await page.getByRole("button", { name: "STAMP IT" }).isDisabled();
console.log("stamp disabled for illegal name:", stampDisabled);
await page.locator("input").fill("Dutch Marlene");
await page.getByRole("button", { name: /^SLICK/ }).click();
await page.getByRole("button", { name: /^Flurry/ }).click();
await page.getByRole("button", { name: /^Counter/ }).click();
await page.getByRole("button", { name: /^Nimble/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "shots/workbench-1.png" });
await page.getByRole("button", { name: "STAMP IT" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/lobby-yours-1.png" });
// pick it and go to the ring
await page.locator("button", { hasText: "Counter · Flurry" }).first().click().catch(() => {});
await page.waitForTimeout(300);
const stored = await page.evaluate(() => localStorage.getItem("sublevel.customs.v1"));
console.log("persisted:", stored);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log(logs.join("\n") || "(no errors)");
await browser.close();
