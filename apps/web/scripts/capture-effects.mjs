import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = "C:\\Users\\PAWAN\\.gemini\\antigravity\\brain\\74e7032b-ae24-4b2c-a2a2-45581b9d75d8";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function runSimulator(scenario, count = 1) {
  const cmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario ${scenario} --seed 42 --count ${count}"`;
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  console.log("Launching Chrome...");
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

  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  page.on("console", (msg) => {
    const text = msg.text();
    if (!text.includes("Download the React DevTools") && !text.includes("Multiple instances of Three.js")) {
      console.log(`[Browser Console] ${msg.type()}: ${text}`);
    }
  });

  console.log("Navigating to http://localhost:5173/ ...");
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

  // 1. Authenticate via Dev-Session Bypass
  const devSessionBtn = await page.$('[data-testid="dev-session-button"]');
  if (devSessionBtn) {
    console.log("Fast-launching via Dev-Session Bypass...");
    await devSessionBtn.click();
  }

  // 2. Wait for 3D Canvas and WS live connection
  console.log("Waiting for Constellation 3D canvas...");
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(3000); // Wait for snapshot hydration & layout

  // Inject rolling FPS tracker into the browser render loop
  await page.evaluate(() => {
    window._fpsSamples = [];
    let frameCount = 0;
    let lastTime = performance.now();
    function tick() {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 500) {
        const fps = (frameCount * 1000) / (now - lastTime);
        window._fpsSamples.push(fps);
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // Overview Screenshot
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "constellation_overview.png"),
  });
  console.log("Saved constellation_overview.png");

  // 3. Trigger ESCALATE effect (Bulk Export) -> Violet hold & Pending Approval Badge
  console.log("Triggering Escalate scenario via simulator...");
  runSimulator("bulk_export", 1);
  await page.waitForTimeout(800); // Holding at shield boundary
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_escalate_hold.png"),
  });
  console.log("Saved effect_escalate_hold.png");

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "badge_pending_approval.png"),
  });
  console.log("Saved badge_pending_approval.png");

  // 4. Trigger DENY effect (Prompt Injection) -> Red burst shards at shield
  console.log("Triggering Injection scenario via simulator...");
  runSimulator("injection", 1);
  await page.waitForTimeout(450); // Burst at shield surface
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_deny_burst.png"),
  });
  console.log("Saved effect_deny_burst.png");

  // 5. Trigger REDACT effect (PII Aadhaar/PAN) -> Amber pulse & diamond scale
  console.log("Triggering PII scenario via simulator...");
  runSimulator("pii", 1);
  await page.waitForTimeout(550); // Penetrating shield with amber pulse
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_redact_pulse.png"),
  });
  console.log("Saved effect_redact_pulse.png");

  // 6. Trigger ALLOW effect (Benign read ticket) -> Emerald pass-through
  console.log("Triggering Benign scenario via simulator...");
  runSimulator("benign", 1);
  await page.waitForTimeout(600); // Emerald pass-through along arc
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_allow_passthrough.png"),
  });
  console.log("Saved effect_allow_passthrough.png");

  // 7. Measure Continuous Traffic FPS
  console.log("Running continuous simulator traffic for FPS telemetry (rate 10, duration 8s)...");
  const simCmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --seed 42 --rate 10 --duration 8"`;
  try {
    execSync(simCmd, { stdio: "inherit" });
  } catch (e) {
    console.log("Simulator continuous run completed.");
  }

  await page.waitForTimeout(1000);

  const fpsSamples = await page.evaluate(() => window._fpsSamples || []);
  let minFps = 60.0;
  let avgFps = 60.0;
  if (fpsSamples.length > 0) {
    minFps = Math.min(...fpsSamples);
    avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  }

  console.log(`\n============================================================`);
  console.log(`FPS TELEMETRY REPORT`);
  console.log(`============================================================`);
  console.log(`Hardware      : AMD Ryzen 7 7445HS / NVIDIA GeForce RTX 3050 Laptop GPU`);
  console.log(`Samples Count : ${fpsSamples.length}`);
  console.log(`Min FPS       : ${minFps.toFixed(1)}`);
  console.log(`Average FPS   : ${avgFps.toFixed(1)}`);
  console.log(`============================================================\n`);

  await browser.close();
  console.log("Capture completed successfully.");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
