import { chromium } from "playwright";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ffmpegPath = "C:\\Users\\PAWAN\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe";
const PREVIEW_URL = "http://localhost:4173";
const MEDIA_DIR = path.resolve("docs/media");
const TEMP_VIDEO_DIR = path.resolve("docs/media/temp_videos");

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(TEMP_VIDEO_DIR)) fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });

async function run() {
  console.log("=== CAPTURING HD 2X ARTIFACTS AND DEMO CLIP ===");

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

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // 2x DPR HD retina
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  // -------------------------------------------------------------------------
  // 1. LANDING PAGE & AGENT JOURNEY BRANCHES
  // -------------------------------------------------------------------------
  console.log("Navigating to Landing Page Journey section...");
  await page.goto(`${PREVIEW_URL}/#journey`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Scroll journey into center view
  await page.evaluate(() => {
    const el = document.getElementById("journey");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await page.waitForTimeout(1500);

  // A. Journey: Benign (Allow branch)
  console.log("Capturing Journey Branch: Benign...");
  await page.click('button:has-text("Send benign")');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "journey-branch-benign-2x.png"),
    fullPage: false,
  });

  // B. Journey: PII (Redact branch)
  console.log("Capturing Journey Branch: PII...");
  await page.click('button:has-text("Send PII")');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "journey-branch-pii-2x.png"),
    fullPage: false,
  });

  // C. Journey: Bulk Export (Escalate branch)
  console.log("Capturing Journey Branch: Bulk Export...");
  await page.click('button:has-text("Send bulk export")');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "journey-branch-bulk-export-2x.png"),
    fullPage: false,
  });

  // D. Journey: Attack (Deny branch)
  console.log("Capturing Journey Branch: Attack...");
  await page.click('button:has-text("Send an attack")');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "journey-branch-attack-2x.png"),
    fullPage: false,
  });

  // -------------------------------------------------------------------------
  // 2. CONSOLE AUTHENTICATION & 3D CONSTELLATION EFFECTS
  // -------------------------------------------------------------------------
  console.log("Authenticating to console...");
  await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const devBtn = await page.$('[data-testid="dev-session-button"]');
  if (devBtn) {
    await devBtn.click();
  } else {
    await page.fill('input[type="password"]', "dev-admin-token-12345");
    await page.click('button[type="submit"]');
  }

  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForTimeout(3000);

  // Populate nodes if needed by running simulator
  console.log("Generating initial traffic...");
  try {
    const cmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --count 10"`;
    execSync(cmd, { stdio: "ignore" });
  } catch {}
  await page.waitForTimeout(2000);

  // A. Effect: Allow
  console.log("Capturing Effect: Allow (green pass-through)...");
  await page.click('[data-testid="test-effect-allow"]');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "effect-allow-2x.png"),
  });
  await page.waitForTimeout(1000);

  // B. Effect: Redact
  console.log("Capturing Effect: Redact (amber pulse + token scrub)...");
  await page.click('[data-testid="test-effect-redact"]');
  await page.waitForTimeout(450);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "effect-redact-2x.png"),
  });
  await page.waitForTimeout(1000);

  // C. Effect: Deny
  console.log("Capturing Effect: Deny (crimson shield burst)...");
  await page.click('[data-testid="test-effect-deny"]');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "effect-deny-2x.png"),
  });
  await page.waitForTimeout(1000);

  // D. Effect: Escalate
  console.log("Capturing Effect: Escalate (violet hold pod)...");
  await page.click('[data-testid="test-effect-escalate"]');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "effect-escalate-2x.png"),
  });

  // E. Badge: Pending Approval badge on agent node
  console.log("Capturing Badge: Pending approval on agent node...");
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "badge-pending-approval-2x.png"),
  });

  // Reset Badges test check
  console.log("Testing Reset Badges button...");
  const resetBtn = await page.$('[data-testid="test-effect-reset"]');
  if (resetBtn) await resetBtn.click();
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // 3. UI-2A APPLICATION PAGES
  // -------------------------------------------------------------------------
  console.log("Capturing UI-2a: Agents & Tools Page...");
  await page.click('[data-testid="nav-agents---tools"]');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2a-agents-2x.png"),
  });

  console.log("Capturing UI-2a: Decisions & Audit Page...");
  await page.click('[data-testid="nav-decisions---audit"]');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2a-decisions-2x.png"),
  });

  console.log("Capturing UI-2a: Settings & Diagnostics Page...");
  await page.click('[data-testid="nav-settings"]');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2a-settings-2x.png"),
  });

  // -------------------------------------------------------------------------
  // 4. FINALIZE & PROCESS VIDEO
  // -------------------------------------------------------------------------
  console.log("Finalizing video recording...");
  await page.close();
  await context.close();
  await browser.close();

  // Find generated webm
  const videoFiles = fs.readdirSync(TEMP_VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length > 0) {
    const rawWebm = path.join(TEMP_VIDEO_DIR, videoFiles[0]);
    const targetMp4 = path.join(MEDIA_DIR, "ui2a-console-tour.mp4");

    if (fs.existsSync(ffmpegPath)) {
      console.log(`Converting ${rawWebm} to compressed MP4 via bundled ffmpeg...`);
      const ffmpegCmd = `"${ffmpegPath}" -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -crf 26 -preset fast -movflags +faststart "${targetMp4}"`;
      try {
        execSync(ffmpegCmd, { stdio: "inherit" });
        const stats = fs.statSync(targetMp4);
        console.log(`Video created successfully: ${targetMp4} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        console.error("FFmpeg conversion error:", err.message);
        fs.copyFileSync(rawWebm, path.join(MEDIA_DIR, "ui2a-console-tour.webm"));
      }
    } else {
      fs.copyFileSync(rawWebm, path.join(MEDIA_DIR, "ui2a-console-tour.webm"));
    }
  }

  console.log("=== ALL MEDIA CAPTURED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Capture script failure:", err);
  process.exit(1);
});
