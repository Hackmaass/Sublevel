// node scripts/fps.mjs [query] [viewportW] [viewportH]  — frames/sec of the match view under SwiftShader (relative only)
import { chromium } from "playwright";
const [query = "", w = "1920", h = "1080"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto((process.env.BASE_URL ?? "http://localhost:3000") + "/" + query, { waitUntil: "networkidle" });
await page.getByText("QUICK FIGHT").click();
await page.waitForTimeout(6000);
const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 > 6000) res((n / ((performance.now() - t0) / 1000)).toFixed(2));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
);
console.log(`fps(${query || "default"} @${w}x${h}) =`, fps);
await browser.close();
