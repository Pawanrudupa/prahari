import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mediaDir = path.resolve(__dirname, "../../../docs/media");

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 720 },
});

test.describe("Phase 4b Decision Explain & Grounding Verification", () => {
  test("Explain tab: Grounded Allow vs Ungrounded Deny decisions", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);

    // 1. Dev Login
    await page.goto("/login");
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible({ timeout: 10000 });
    await devBtn.click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 2. Ensure Knowledge Base sample policies are loaded
    await page.getByTestId("nav-knowledge-base").click();
    await page.waitForURL(/\/app\/knowledge-base/, { timeout: 10000 });
    await page.waitForTimeout(1000);

    const loadSampleBtn = page.getByRole("button", { name: /Load Sample Policies|Load Sample Docs/i }).first();
    if (await loadSampleBtn.isVisible()) {
      await loadSampleBtn.click();
      await page.waitForTimeout(2000);
    }

    // 3. Trigger simulations for both grounded allow (benign) and ungrounded deny (injection)
    await request.post("http://localhost:8000/v1/dev/simulate", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: { scenario: "benign", count: 2 },
    });

    await request.post("http://localhost:8000/v1/dev/simulate", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: { scenario: "injection", count: 2 },
    });

    // 4. Open Decisions & Audit Log
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 10000 });
    await page.waitForTimeout(1500);

    // 5. Test Grounded Allow Decision (e.g. benign tickets.read / R1)
    // Filter to 'allow'
    const allowFilter = page.getByRole("button", { name: /^allow$/i }).first();
    await allowFilter.click();
    await page.waitForTimeout(1000);

    // Click the first allow decision row
    const allowRow = page.locator('[data-testid^="decision-row-"]').first();
    await expect(allowRow).toBeVisible();
    await allowRow.click();
    await page.waitForTimeout(800);

    // Switch to "Explain Decision" tab
    const explainTab = page.getByTestId("tab-explain-decision");
    await expect(explainTab).toBeVisible();
    await explainTab.click();
    await page.waitForTimeout(1500);

    // Verify Grounded status badge and cards
    await expect(page.getByText("Grounded in Declared Policy")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Why this Decision")).toBeVisible();
    await expect(page.getByText("Declared Policy Basis")).toBeVisible();
    await expect(page.getByText(/Access Control Policy/i)).toBeVisible();
    await expect(page.getByText(/Standing Note:/i)).toBeVisible();

    // Capture screenshot: Grounded Allow
    const allowScreenshotPath = path.join(mediaDir, "phase4b-explain-grounded-allow.png");
    await page.screenshot({ path: allowScreenshotPath });
    console.log("Saved screenshot:", allowScreenshotPath);

    // Close the drawer
    await page.getByTestId("close-decision-drawer-btn").click();
    await page.waitForTimeout(500);

    // 6. Test Ungrounded Deny Decision (e.g. injection deny / R4)
    // Filter to 'deny'
    const denyFilter = page.getByRole("button", { name: /^deny$/i }).first();
    await denyFilter.click();
    await page.waitForTimeout(1000);

    // Click the first deny decision row
    const denyRow = page.locator('[data-testid^="decision-row-"]').first();
    await expect(denyRow).toBeVisible();
    await denyRow.click();
    await page.waitForTimeout(800);

    // Switch to "Explain Decision" tab
    await explainTab.click();
    await page.waitForTimeout(1500);

    // Verify Ungrounded status badge
    await expect(page.getByText("No Declared Source", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/No declared source\. Rule does not specify policy source mapping/i)).toBeVisible();
    await expect(page.getByText("Topical Clause Suggestions")).toBeVisible();

    // Capture screenshot: Ungrounded Deny
    const denyScreenshotPath = path.join(mediaDir, "phase4b-explain-ungrounded-deny.png");
    await page.screenshot({ path: denyScreenshotPath });
    console.log("Saved screenshot:", denyScreenshotPath);

    // Expand topical suggestions to demonstrate UI
    await page.getByText(/Topical Clause Suggestions/i).click();
    await page.waitForTimeout(1500);

    // Save clip
    await page.close();
    const clipPath = path.join(mediaDir, "phase4b-decision-explain-flow.webm");
    await page.video()?.saveAs(clipPath);
    console.log("Saved clip to:", clipPath);
  });
});
