import { chromium } from "playwright";
import { execSync } from "child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function run() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=gl",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--window-size=1600,1000",
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  const devBtn = await page.$('[data-testid="dev-session-button"]');
  if (devBtn) await devBtn.click();
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Set up high-precision FPS sampler
  await page.evaluate(() => {
    window._fpsSamples = [];
    let frameCount = 0;
    let lastTime = performance.now();
    function tick() {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 500) {
        window._fpsSamples.push((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  console.log("Starting simulator continuous interleaved traffic (--rate 10 --count 40)...");
  try {
    const cmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --seed 42 --rate 10 --count 40"`;
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Simulator completed with notice:", err.message);
  }

  await page.waitForTimeout(1000);
  const samples = await page.evaluate(() => window._fpsSamples || []);
  const min = Math.min(...samples);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

  console.log("\n============================================================");
  console.log("FINAL CONTINUOUS SIMULATOR FPS REPORT");
  console.log("============================================================");
  console.log("Hardware Specs : AMD Ryzen 7 7445HS (6C/12T) | NVIDIA GeForce RTX 3050 Laptop GPU");
  console.log(`Samples Count  : ${samples.length}`);
  console.log(`Minimum FPS    : ${min.toFixed(1)}`);
  console.log(`Average FPS    : ${avg.toFixed(1)}`);
  console.log("============================================================\n");

  await browser.close();
}

run().catch(console.error);
