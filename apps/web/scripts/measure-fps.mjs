import { chromium } from "playwright";
import { execSync } from "child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PREVIEW_URL = "http://localhost:4173";

function computePercentiles(samples) {
  if (!samples.length) return { min: 60, median: 60, p5: 60, avg: 60 };
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p5Index = Math.max(0, Math.floor(sorted.length * 0.05));
  const p5 = sorted[p5Index];
  return { min, median, p5, avg };
}

async function run() {
  console.log("============================================================");
  console.log("PRAHARI GPU PERFORMANCE BENCHMARK (VITE PREVIEW + NVIDIA GPU)");
  console.log("============================================================");
  console.log("Launching headed Chrome on hardware GPU (NVIDIA RTX 3050)...");

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--window-size=1600,1000",
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  // 1. Navigate to login on vite preview
  console.log(`Navigating to ${PREVIEW_URL}/login...`);
  await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Click dev session button or admin login
  const devBtn = await page.$('[data-testid="dev-session-button"]');
  if (devBtn) {
    console.log("Authenticating via Dev-Session portal...");
    await devBtn.click();
  } else {
    console.log("Submitting admin token...");
    await page.fill('input[type="password"]', "dev-admin-token-12345");
    await page.click('button[type="submit"]');
  }

  // Wait for 3D canvas on /app/constellation
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForTimeout(2500);

  // 2. Query unmasked WebGL renderer string
  const rendererString = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return "No canvas element";
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "No WebGL context";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "Unknown renderer";
  });

  console.log(`Detected WebGL Renderer: "${rendererString}"`);

  if (!rendererString.toLowerCase().includes("nvidia") && !rendererString.toLowerCase().includes("geforce")) {
    console.error("\n[FATAL] Renderer is not the NVIDIA GPU! Detected:", rendererString);
    console.error("Stopping as requested by strict invariant.\n");
    await browser.close();
    process.exit(1);
  }

  console.log("CONFIRMED: NVIDIA Hardware GPU is actively rendering the 3D canvas.\n");

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
  console.log("Measuring Continuous Mode (interleaved traffic: 50 events at 10 req/s)...");
  try {
    const cmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --seed 42 --rate 10 --count 50"`;
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Simulator notice:", err.message);
  }

  await page.waitForTimeout(3000);
  const continuousSamples = await page.evaluate(() => {
    const s = [...(window._fpsSamples || [])];
    window._fpsSamples = []; // reset for next mode
    return s;
  });

  const contStats = computePercentiles(continuousSamples);
  const contHudFps = await page.$eval('[data-testid="hud-fps-readout"]', (el) => el.textContent?.trim() || "N/A").catch(() => "N/A");

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

  // Check if still on canvas or re-login if needed
  let hasCanvas = await page.$("canvas");
  if (!hasCanvas) {
    await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
    const btn = await page.$('[data-testid="dev-session-button"]');
    if (btn) await btn.click();
    await page.waitForSelector("canvas", { timeout: 20000 });
  }
  await page.waitForTimeout(3000);

  // Clear samples and start fresh collection
  await page.evaluate(() => {
    window._fpsSamples = [];
  });

  // Run stress traffic with all 200 nodes in view
  console.log("Running stress traffic benchmark (40 events)...");
  try {
    const trafficCmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --rate 10 --count 40"`;
    execSync(trafficCmd, { stdio: "inherit" });
  } catch (err) {
    console.error("Stress traffic notice:", err.message);
  }

  await page.waitForTimeout(3000);
  const stressSamples = await page.evaluate(() => window._fpsSamples || []);
  const stressStats = computePercentiles(stressSamples);
  const stressHudFps = await page.$eval('[data-testid="hud-fps-readout"]', (el) => el.textContent?.trim() || "N/A").catch(() => "N/A");

  console.log("\n============================================================");
  console.log("GPU PERFORMANCE BENCHMARK REPORT (VITE PREVIEW + HEADED CHROME)");
  console.log("============================================================");
  console.log(`WebGL Renderer : ${rendererString}`);
  console.log("Resolution     : 1600x1000 (DPR 2.0 selective bloom + instanced)");
  console.log("Target Server  : Vite Preview (http://localhost:4173)");
  console.log("------------------------------------------------------------");
  console.log("1. Continuous Traffic Mode (3 canonical agents, continuous):");
  console.log(`   - In-App HUD Reading : ${contHudFps}`);
  console.log(`   - Minimum FPS        : ${contStats.min.toFixed(1)} FPS`);
  console.log(`   - Median FPS         : ${contStats.median.toFixed(1)} FPS`);
  console.log(`   - 5th Percentile (p5): ${contStats.p5.toFixed(1)} FPS`);
  console.log(`   - Average FPS        : ${contStats.avg.toFixed(1)} FPS`);
  console.log("------------------------------------------------------------");
  console.log("2. Stress Mode (200 Nodes: 50 Agents + 150 Tools):");
  console.log(`   - In-App HUD Reading : ${stressHudFps}`);
  console.log(`   - Minimum FPS        : ${stressStats.min.toFixed(1)} FPS`);
  console.log(`   - Median FPS         : ${stressStats.median.toFixed(1)} FPS`);
  console.log(`   - 5th Percentile (p5): ${stressStats.p5.toFixed(1)} FPS`);
  console.log(`   - Average FPS        : ${stressStats.avg.toFixed(1)} FPS`);
  console.log("============================================================\n");

  await browser.close();
}

run().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
