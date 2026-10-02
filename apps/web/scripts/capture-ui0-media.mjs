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
  console.log("Starting UI-0 Media Capture at 2x DPR...");
  const browser = await chromium.launch({
    headless: true,
  });

  // 1. High-Resolution Screenshots Context (2x DPR)
  const hiDpiContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await hiDpiContext.newPage();

  console.log("Navigating to http://localhost:5173/ ...");
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Capture Hero Section
  console.log("Capturing Hero Section at 2x DPR...");
  const heroPath = path.join(mediaDir, "ui0-landing-hero-2x.png");
  await page.screenshot({ path: heroPath, fullPage: false });
  console.log(`Saved: ${heroPath}`);

  // Scroll to Pipeline / Agent Journey Section
  console.log("Scrolling to Agent Journey 3D Section...");
  const pipelineSection = page.locator("#pipeline");
  await pipelineSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  console.log("Capturing 3D Agent Journey Pipeline at 2x DPR...");
  const journeyPath = path.join(mediaDir, "ui0-agent-journey-3d-2x.png");
  await page.screenshot({ path: journeyPath, fullPage: false });
  console.log(`Saved: ${journeyPath}`);

  // Capture Login Page
  console.log("Navigating to http://localhost:5173/login ...");
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("Capturing Split Login Page at 2x DPR...");
  const loginPath = path.join(mediaDir, "ui0-login-split-2x.png");
  await page.screenshot({ path: loginPath, fullPage: false });
  console.log(`Saved: ${loginPath}`);

  await hiDpiContext.close();

  // 2. Video Recording of Live Attack Demonstration
  console.log("Starting Video Recording Context...");
  const tempVideoDir = path.join(mediaDir, "temp_video");
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
  await videoPage.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await videoPage.waitForTimeout(1000);

  const videoPipeline = videoPage.locator("#pipeline");
  await videoPipeline.scrollIntoViewIfNeeded();
  await videoPage.waitForTimeout(1500);

  console.log("Triggering 'Send an attack' on 3D Agent Journey...");
  const attackBtn = videoPage.getByRole("button", { name: /send an attack/i });
  await attackBtn.click();

  // Record packet traversing and shattering at Gate 03
  await videoPage.waitForTimeout(4500);

  // Close context to finalize video writing
  await videoPage.close();
  await videoContext.close();
  await browser.close();

  // Find generated webm file
  const videoFiles = fs.readdirSync(tempVideoDir).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length > 0) {
    const rawWebm = path.join(tempVideoDir, videoFiles[0]);
    const mp4Path = path.join(mediaDir, "ui0-agent-journey-attack-demo.mp4");
    const gifPath = path.join(mediaDir, "ui0-agent-journey-attack-demo.gif");

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

  console.log("All UI-0 media artifacts successfully captured and committed to docs/media/!");
}

capture().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
