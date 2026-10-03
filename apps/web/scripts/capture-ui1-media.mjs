import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mediaDir = path.resolve(__dirname, "../../../docs/media");

if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

async function capture() {
  console.log("Starting UI-1 Media Capture with Hardware/ANGLE WebGL...");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });

  // 1. High-Resolution Screenshots Context (2x DPR)
  const hiDpiContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await hiDpiContext.newPage();

  // Capture updated 70vh Agent Journey with 4 simulation buttons & branches
  console.log("Navigating to Landing Page...");
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const pipelineSection = page.locator("#pipeline");
  await pipelineSection.scrollIntoViewIfNeeded();
  await page.waitForSelector("#pipeline canvas", { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(4000);

  const journeyPath = path.join(mediaDir, "ui0-agent-journey-updated-2x.png");
  await page.screenshot({ path: journeyPath, fullPage: false });
  console.log(`Saved: ${journeyPath}`);

  // Navigate to Login and sign in via dev-session bypass
  console.log("Signing in via Dev-Session bypass...");
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const devBtn = page.getByTestId("dev-session-button");
  if (await devBtn.isVisible()) {
    await devBtn.click();
    await page.waitForURL(/\/app/, { timeout: 15000 });
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForTimeout(4000);

    // Capture Constellation HD Overview
    console.log("Capturing Constellation HD Overview at 2x DPR...");
    const overviewPath = path.join(mediaDir, "ui1-constellation-overview-2x.png");
    await page.screenshot({ path: overviewPath, fullPage: false });
    console.log(`Saved: ${overviewPath}`);

    // Trigger an effect via Test Effects or Simulator
    console.log("Triggering live effects...");
    const testDenyBtn = page.locator('[data-testid="test-effect-deny"]');
    if (await testDenyBtn.isVisible()) {
      await testDenyBtn.click();
      await page.waitForTimeout(500);
      const effectsPath = path.join(mediaDir, "ui1-constellation-live-effects-2x.png");
      await page.screenshot({ path: effectsPath, fullPage: false });
      console.log(`Saved: ${effectsPath}`);
    } else {
      // Trigger via Simulator HUD button
      const simDenyBtn = page.getByRole("button", { name: "Injection", exact: true });
      if (await simDenyBtn.isVisible()) {
        await simDenyBtn.click();
        await page.waitForTimeout(600);
        const effectsPath = path.join(mediaDir, "ui1-constellation-live-effects-2x.png");
        await page.screenshot({ path: effectsPath, fullPage: false });
        console.log(`Saved: ${effectsPath}`);
      }
    }
  }

  await hiDpiContext.close();

  // 2. Video Recording of Live Constellation HD and Particle Physics
  console.log("Starting Constellation HD Video Recording Context...");
  const tempVideoDir = path.join(mediaDir, "temp_ui1_video");
  if (!fs.existsSync(tempVideoDir)) fs.mkdirSync(tempVideoDir, { recursive: true });

  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1280, height: 720 },
    },
  });

  const videoPage = await videoContext.newPage();
  await videoPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
  await videoPage.waitForTimeout(1000);

  const devBtnVid = videoPage.getByTestId("dev-session-button");
  if (await devBtnVid.isVisible()) {
    await devBtnVid.click();
    await videoPage.waitForURL(/\/app/, { timeout: 15000 });
    await videoPage.waitForSelector("canvas", { timeout: 15000 });
    await videoPage.waitForTimeout(2000);

    // Trigger simulator scenario
    const simAllBtn = videoPage.getByRole("button", { name: /run all/i });
    if (await simAllBtn.isVisible()) {
      console.log("Triggering 'Run All' simulation in console...");
      await simAllBtn.click();
      await videoPage.waitForTimeout(7000);
    } else {
      // Trigger via test panel
      const testDeny = videoPage.locator('[data-testid="test-effect-deny"]');
      const testEscalate = videoPage.locator('[data-testid="test-effect-escalate"]');
      const testRedact = videoPage.locator('[data-testid="test-effect-redact"]');
      const testAllow = videoPage.locator('[data-testid="test-effect-allow"]');

      if (await testDeny.isVisible()) {
        await testAllow.click();
        await videoPage.waitForTimeout(1000);
        await testRedact.click();
        await videoPage.waitForTimeout(1000);
        await testEscalate.click();
        await videoPage.waitForTimeout(1000);
        await testDeny.click();
        await videoPage.waitForTimeout(3000);
      }
    }
  }

  // Close context to finalize video writing
  await videoPage.close();
  await videoContext.close();
  await browser.close();

  // Convert generated webm to MP4 and GIF (< 10MB)
  const videoFiles = fs.readdirSync(tempVideoDir).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length > 0) {
    const rawWebm = path.join(tempVideoDir, videoFiles[0]);
    const mp4Path = path.join(mediaDir, "ui1-constellation-demo.mp4");
    const gifPath = path.join(mediaDir, "ui1-constellation-demo.gif");

    console.log(`Locating ffmpeg to convert ${rawWebm} ...`);
    const pythonExeCmd =
      'uv run --with imageio-ffmpeg python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"';
    const ffmpegExe = execSync(pythonExeCmd, {
      cwd: path.resolve(__dirname, "../../../services/api"),
      encoding: "utf-8",
    }).trim();

    console.log(`Using ffmpeg: ${ffmpegExe}`);

    // Convert to MP4
    console.log("Generating MP4 video...");
    execSync(
      `"${ffmpegExe}" -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -r 30 -movflags +faststart "${mp4Path}"`,
      { stdio: "inherit" },
    );
    console.log(`Saved MP4: ${mp4Path}`);

    // Convert to optimized GIF (< 10MB)
    console.log("Generating optimized GIF clip (< 10MB)...");
    const palettePath = path.join(tempVideoDir, "palette.png");
    execSync(
      `"${ffmpegExe}" -y -i "${rawWebm}" -vf "fps=15,scale=960:-1:flags=lanczos,palettegen" "${palettePath}"`,
      { stdio: "inherit" },
    );
    execSync(
      `"${ffmpegExe}" -y -i "${rawWebm}" -i "${palettePath}" -lavfi "fps=15,scale=960:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`,
      { stdio: "inherit" },
    );
    console.log(`Saved GIF: ${gifPath}`);

    // Cleanup temp dir
    fs.rmSync(tempVideoDir, { recursive: true, force: true });
  }

  console.log("All UI-1 media artifacts successfully captured and committed to docs/media/!");
}

capture().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
