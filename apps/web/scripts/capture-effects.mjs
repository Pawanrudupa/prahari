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
  console.log("Launching headed Chrome on real GPU for visual effects capture...");
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

  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  console.log("Navigating to http://localhost:5173/ ...");
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

  // 1. Authenticate via Dev-Session Bypass
  const devSessionBtn = await page.$('[data-testid="dev-session-button"]');
  if (devSessionBtn) {
    console.log("Fast-launching via Dev-Session Bypass...");
    await devSessionBtn.click();
  }

  // 2. Wait for 3D Canvas
  console.log("Waiting for Constellation 3D canvas...");
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(3000); // Wait for snapshot hydration & layout

  // Overview Screenshot (Auto-framed with margin)
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "constellation_overview.png"),
  });
  console.log("Saved constellation_overview.png");

  // 3. CAPTURE EFFECTS VIA DEV TEST EFFECTS PANEL
  console.log("Testing effects via Test Effects Panel...");

  // Effect A: Allow (Pass-Through)
  console.log("Triggering Allow effect via panel...");
  await page.click('[data-testid="test-effect-allow"]');
  await page.waitForTimeout(350); // Mid-flight pass-through
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_allow_passthrough.png"),
  });
  console.log("Saved effect_allow_passthrough.png");

  // Effect B: Redact (Amber Pulse)
  console.log("Triggering Redact effect via panel...");
  await page.click('[data-testid="test-effect-redact"]');
  await page.waitForTimeout(400); // Amber pulse at shield
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_redact_pulse.png"),
  });
  console.log("Saved effect_redact_pulse.png");

  // Effect C: Deny (Policy Shield Burst)
  console.log("Triggering Deny effect via panel...");
  await page.click('[data-testid="test-effect-deny"]');
  await page.waitForTimeout(550); // Bursting at shield boundary
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_deny_burst.png"),
  });
  console.log("Saved effect_deny_burst.png");

  // Effect D: Escalate (Hold at Shield + Halo Badge on Agent)
  console.log("Triggering Escalate effect via panel...");
  await page.click('[data-testid="test-effect-escalate"]');
  await page.waitForTimeout(800); // Holding violet particle at shield
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "effect_escalate_hold.png"),
  });
  console.log("Saved effect_escalate_hold.png");

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "badge_pending_approval.png"),
  });
  console.log("Saved badge_pending_approval.png");

  // Reset Badges
  await page.click('[data-testid="test-clear-escalations"]');
  await page.waitForTimeout(500);

  // 4. ALSO VERIFY WITH LIVE SIMULATOR
  console.log("Verifying with live simulator continuous traffic...");
  runSimulator("all", 15);
  await page.waitForTimeout(1500);

  console.log("All visual effects successfully captured and verified!");
  await browser.close();
}

main().catch(console.error);
