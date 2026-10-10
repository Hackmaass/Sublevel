// Headless screenshot helper:  node scripts/shot.mjs <path> <out.png> [wait-ms] [w] [h]
// Uses Chromium + SwiftShader so WebGL scenes render without a GPU.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [path = "/", out = "shots/out.png", wait = "1500", w = "1920", h = "1080"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base + (path.startsWith("http") ? "" : "/") + path.replace(/^[A-Za-z]:.*Git/, ""), { waitUntil: "networkidle" });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log(logs.slice(0, 20).join("\n") || "(no console output)");
console.log("saved", out);
await browser.close();
