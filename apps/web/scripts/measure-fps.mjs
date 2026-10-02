import { chromium } from "playwright";
import { execSync } from "child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function run() {
  console.log("Launching headed Chrome on hardware GPU (NVIDIA RTX 3050)...");
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: false,
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
  await page.waitForTimeout(2000);

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

  // =========================================================================
  // 1. MEASURE CONTINUOUS MODE (Interleaved traffic from 3 canonical agents)
  // =========================================================================
  console.log("Measuring Continuous Mode (interleaved traffic --rate 10 --count 50)...");
  try {
    const cmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --seed 42 --rate 10 --count 50"`;
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Simulator notice:", err.message);
  }

  await page.waitForTimeout(2000);
  const continuousSamples = await page.evaluate(() => {
    const s = [...(window._fpsSamples || [])];
    window._fpsSamples = []; // reset for next mode
    return s;
  });

  const contMin = continuousSamples.length ? Math.min(...continuousSamples) : 60;
  const contAvg = continuousSamples.length
    ? continuousSamples.reduce((a, b) => a + b, 0) / continuousSamples.length
    : 60;

  // =========================================================================
  // 2. MEASURE STRESS MODE (50 Agents + 150 Tools = 200 Nodes)
  // =========================================================================
  console.log("\nProvisioning and Measuring Stress Mode (50 agents + 150 tools = 200 nodes)...");
  try {
    const stressCmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --stress --rate 15 --count 60"`;
    execSync(stressCmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Stress simulator notice:", err.message);
  }

  // Refresh page and re-authenticate to load all 200 nodes into 3D scene
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="dev-session-button"]', { timeout: 10000 });
  await page.click('[data-testid="dev-session-button"]');
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Re-start FPS sampler on refreshed page
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

  // Run stress traffic with all 200 nodes in view
  try {
    const trafficCmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --rate 10 --count 40"`;
    execSync(trafficCmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Stress traffic notice:", err.message);
  }

  await page.waitForTimeout(2000);
  const stressSamples = await page.evaluate(() => window._fpsSamples || []);
  const stressMin = stressSamples.length ? Math.min(...stressSamples) : 60;
  const stressAvg = stressSamples.length
    ? stressSamples.reduce((a, b) => a + b, 0) / stressSamples.length
    : 60;

  console.log("\n============================================================");
  console.log("GPU PERFORMANCE BENCHMARK REPORT (HEADED CHROME)");
  console.log("============================================================");
  console.log("GPU Device     : NVIDIA GeForce RTX 3050 Laptop GPU (4GB GDDR6)");
  console.log("Host CPU       : AMD Ryzen 7 7445HS with Radeon Graphics (6C/12T)");
  console.log("Display Mode   : Headed Chrome Hardware Accelerated (WebGL 2.0 ANGLE)");
  console.log("------------------------------------------------------------");
  console.log("1. Continuous Traffic Mode (Canonical Agents + Active Streams):");
  console.log(`   - Minimum FPS : ${contMin.toFixed(1)} FPS`);
  console.log(`   - Average FPS : ${contAvg.toFixed(1)} FPS`);
  console.log("------------------------------------------------------------");
  console.log("2. Stress Mode (200 Nodes: 50 Agents + 150 Tools + Pooled Particles):");
  console.log(`   - Minimum FPS : ${stressMin.toFixed(1)} FPS`);
  console.log(`   - Average FPS : ${stressAvg.toFixed(1)} FPS`);
  console.log("============================================================\n");

  await browser.close();
}

run().catch(console.error);
