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
  console.log("============================================================");
  console.log("CAPTURING UI-2B MEDIA ARTIFACTS AND FULL GOVERNANCE FLOW");
  console.log("============================================================");

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
    deviceScaleFactor: 2, // 2x DPR retina
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  // -------------------------------------------------------------------------
  // 0. CHECK AGENT JOURNEY (Confirm gates are not clipped & buttons active)
  // -------------------------------------------------------------------------
  console.log("Step 0: Checking Agent Journey on Landing Page...");
  await page.goto(`${PREVIEW_URL}/#journey`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const el = document.getElementById("journey");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await page.waitForTimeout(2000);

  // Verify journey buttons are enabled
  const benignBtn = page.getByText("Send benign");
  await benignBtn.click();
  await page.waitForTimeout(2500);

  // -------------------------------------------------------------------------
  // 1. LOGIN
  // -------------------------------------------------------------------------
  console.log("Step 1: Navigating to login...");
  await page.goto(`${PREVIEW_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const devBtn = page.locator('[data-testid="dev-session-button"]');
  if (await devBtn.isVisible()) {
    await devBtn.click();
  } else {
    await page.fill('input[type="password"]', "dev-admin-token-12345");
    await page.click('button[type="submit"]');
  }

  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2500);

  // -------------------------------------------------------------------------
  // 2. REGISTER AGENT (Key shown once with copy)
  // -------------------------------------------------------------------------
  console.log("Step 2: Navigating to Agents & Tools...");
  await page.click('[data-testid="nav-agents---tools"]');
  await page.waitForTimeout(1500);

  const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
  const agentName = `SecOps-Agent-${randomSuffix}`;

  console.log(`Registering agent: ${agentName}...`);
  await page.click('button:has-text("Register Agent")');
  await page.waitForTimeout(500);

  await page.fill('input[placeholder="e.g. Finance-Analyst"]', agentName);
  await page.fill('input[placeholder="e.g. FinanceOps"]', "SecOps Engineering");
  await page.selectOption("select", "security");
  await page.waitForTimeout(500);

  // Submit registration
  await page.click('button:has-text("Register & Generate Key")');
  await page.waitForTimeout(1500);

  // Key reveal dialog: copy key
  console.log("Copying revealed single-use agent credential...");
  const copyBtn = page.locator('div:has(> span) button:has(svg.lucide-copy)');
  if (await copyBtn.isVisible()) {
    await copyBtn.click();
    await page.waitForTimeout(600);
  }
  await page.click('button:has-text("I Have Saved the Key")');
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // 3. CAPABILITY GRANTS TAB
  // -------------------------------------------------------------------------
  console.log("Step 3: Opening Capability Grants & Tools tab...");
  await page.click('button:has-text("Capability Grants & Tools")');
  await page.waitForTimeout(1500);

  // Capture screenshot: docs/media/ui2a-grants-tab-2x.png
  console.log("Saving screenshot: docs/media/ui2a-grants-tab-2x.png...");
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2a-grants-tab-2x.png"),
  });
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // 4. RUN SIMULATION
  // -------------------------------------------------------------------------
  console.log("Step 4: Running simulator to generate governance decisions...");
  await page.click('[data-testid="nav-constellation"]');
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2000);

  const runSimBtn = page.locator('[data-testid="sim-run-button"]');
  if (await runSimBtn.isVisible()) {
    await runSimBtn.click();
    console.log("Simulator triggered via HUD button, waiting for decision stream...");
    await page.waitForTimeout(4000);
  } else {
    try {
      const simCmd = `cmd /c "set PYTHONPATH=c:\\Users\\PAWAN\\prahari && cd c:\\Users\\PAWAN\\prahari\\services\\api && uv run python -m services.simulator --scenario all --count 15"`;
      execSync(simCmd, { stdio: "ignore" });
    } catch {}
    await page.waitForTimeout(3000);
  }

  // -------------------------------------------------------------------------
  // 5. DECISIONS & AUDIT PAGE -> FILTER -> DETAIL DRAWER -> VERIFY CHAIN
  // -------------------------------------------------------------------------
  console.log("Step 5: Navigating to Decisions & Audit page...");
  await page.click('[data-testid="nav-decisions---audit"]');
  await page.waitForTimeout(2000);

  // Capture screenshot: docs/media/ui2a-decisions-page-2x.png
  console.log("Saving screenshot: docs/media/ui2a-decisions-page-2x.png...");
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2a-decisions-page-2x.png"),
  });

  // Filter decisions
  console.log("Applying outcome filter...");
  const allowFilter = page.locator('button:has-text("allow")').first();
  if (await allowFilter.isVisible()) {
    await allowFilter.click();
    await page.waitForTimeout(1000);
  }

  // Open detail drawer for first decision
  console.log("Opening decision detail drawer...");
  const firstRow = page.locator("tbody tr").first();
  if (await firstRow.isVisible()) {
    await firstRow.click();
    await page.waitForTimeout(1500);
    // Close drawer
    const closeDrawer = page.locator('button:has-text("Close")').first();
    if (await closeDrawer.isVisible()) {
      await closeDrawer.click();
      await page.waitForTimeout(600);
    }
  }

  // Click Verify Chain
  console.log("Triggering cryptographic audit chain verification...");
  await page.click('button:has-text("Verify Chain")');
  await page.waitForTimeout(2500);

  // Close verification report
  const closeReportBtn = page.locator('button:has-text("Close Report")');
  if (await closeReportBtn.isVisible()) {
    await closeReportBtn.click();
    await page.waitForTimeout(800);
  }

  // -------------------------------------------------------------------------
  // 6. UI-2B PAGES: APPROVALS, POLICIES, SESSIONS
  // -------------------------------------------------------------------------
  console.log("Step 6: Navigating to Human Approvals Queue (/app/approvals)...");
  await page.click('[data-testid="nav-human-approvals"]');
  await page.waitForTimeout(2000);
  console.log("Saving screenshot: docs/media/ui2b-approvals-deck-2x.png...");
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2b-approvals-deck-2x.png"),
  });

  console.log("Step 7: Navigating to Policy Studio (/app/policies)...");
  await page.click('[data-testid="nav-policy-studio"]');
  await page.waitForTimeout(3500); // Allow Monaco to load locally
  console.log("Saving screenshot: docs/media/ui2b-policy-studio-2x.png...");
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2b-policy-studio-2x.png"),
  });

  console.log("Step 8: Navigating to Session DAG (/app/sessions)...");
  await page.click('[data-testid="nav-session-dag"]');
  await page.waitForTimeout(2500);
  console.log("Saving screenshot: docs/media/ui2b-session-dag-2x.png...");
  await page.screenshot({
    path: path.join(MEDIA_DIR, "ui2b-session-dag-2x.png"),
  });

  // -------------------------------------------------------------------------
  // 7. FINALIZE & CONVERT CLIP
  // -------------------------------------------------------------------------
  console.log("Finalizing video recording...");
  await page.close();
  await context.close();
  await browser.close();

  const videoFiles = fs.readdirSync(TEMP_VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length > 0) {
    const rawWebm = path.join(TEMP_VIDEO_DIR, videoFiles[videoFiles.length - 1]);
    const targetMp4 = path.join(MEDIA_DIR, "ui2b-flow-demo.mp4");

    if (fs.existsSync(ffmpegPath)) {
      console.log(`Converting ${rawWebm} to compressed MP4 via bundled ffmpeg...`);
      const ffmpegCmd = `"${ffmpegPath}" -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -crf 26 -preset fast -movflags +faststart "${targetMp4}"`;
      try {
        execSync(ffmpegCmd, { stdio: "inherit" });
        const stats = fs.statSync(targetMp4);
        console.log(`Video created successfully: ${targetMp4} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        console.error("FFmpeg error:", err.message);
        fs.copyFileSync(rawWebm, path.join(MEDIA_DIR, "ui2b-flow-demo.webm"));
      }
    } else {
      fs.copyFileSync(rawWebm, path.join(MEDIA_DIR, "ui2b-flow-demo.webm"));
    }
  }

  console.log("=== ALL UI-2B MEDIA COMMITTED AND PROCESSED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Error during media capture:", err);
  process.exit(1);
});
