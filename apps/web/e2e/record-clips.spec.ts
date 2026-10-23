import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import {
  tamperAuditRecordDirectSql,
  restoreAuditRecordDirectSql,
} from "./helpers/directSqlAuditTamper";

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

test.describe("Record UI-2b.1 Media Clips and Screenshots", () => {
  test("Record Clip 1: Approval Lifecycle (bulk export -> card -> A -> retry -> consumed + deny + expired)", async ({
    page,
    request,
  }) => {
    // 1. Login
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 2. Trigger bulk export simulation
    await request.post("http://localhost:8000/v1/dev/simulate", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: { scenario: "bulk_export", steps: 1 },
    });

    // 3. Open Approvals page
    await page.getByTestId("nav-human-approvals").click();
    await page.waitForURL(/\/app\/approvals/, { timeout: 8000 });
    await page.waitForTimeout(1500);

    // 4. Press 'A' to approve
    await page.keyboard.press("a");
    await page.waitForTimeout(2000);

    // 5. Inspect tabs: Approved, Denied, Expired
    await page.getByRole("button", { name: /^approved$/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: /^denied$/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: /^expired$/i }).click();
    await page.waitForTimeout(1000);

    // 6. Open Decisions & Audit Log to view audit trail
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 8000 });
    await page.waitForTimeout(1500);

    // Save video
    await page.close();
    await page.video()?.saveAs(path.join(mediaDir, "ui2b1-approval-lifecycle.webm"));
    console.log("Saved video to:", path.join(mediaDir, "ui2b1-approval-lifecycle.webm"));
  });

  test("Record Clip 2: Policy Lifecycle (edit YAML -> validate -> save version -> activate -> rollback)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });

    await page.getByTestId("nav-policy-studio").click();
    await page.waitForURL(/\/app\/policies/, { timeout: 8000 });
    await expect(page.getByText("Version History")).toBeVisible();
    await page.waitForTimeout(1200);

    // Validate
    await page.getByTestId("policy-validate-btn").click();
    await page.waitForTimeout(1500);

    // Save Version
    await page.getByTestId("policy-save-version-btn").click();
    await page.waitForTimeout(2000);

    // Activate
    const activateBtn = page.getByRole("button", { name: /^Activate$/i }).first();
    if (await activateBtn.isVisible()) {
      await activateBtn.click();
      await page.waitForTimeout(1500);
    }

    // Rollback
    const rollbackBtn = page.getByTestId("policy-rollback-btn");
    if (await rollbackBtn.isEnabled()) {
      await rollbackBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.close();
    await page.video()?.saveAs(path.join(mediaDir, "ui2b1-policy-lifecycle.webm"));
    console.log("Saved video to:", path.join(mediaDir, "ui2b1-policy-lifecycle.webm"));
  });

  test("Record Clip 3: Session DAG (timeline scrubber slider, node click detail drawer, 2D/3D toggle)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });

    await page.getByTestId("nav-session-dag").click();
    await page.waitForURL(/\/app\/sessions/, { timeout: 8000 });
    await page.waitForTimeout(2000);

    // Scrub timeline slider
    const slider = page.locator('input[type="range"]');
    if (await slider.isVisible()) {
      await slider.fill("50");
      await page.waitForTimeout(1000);
      await slider.fill("100");
      await page.waitForTimeout(1000);
    }

    // Toggle 2D / 3D
    const toggle = page.getByRole("button", { name: /View: 2D|View: 3D/i });
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(1500);
      await toggle.click();
      await page.waitForTimeout(1500);
    }

    await page.close();
    await page.video()?.saveAs(path.join(mediaDir, "ui2b1-session-dag.webm"));
    console.log("Saved video to:", path.join(mediaDir, "ui2b1-session-dag.webm"));
  });

  test("Capture 2x Screenshots: Admin Events tab and Tampered Verify Chain modal", async ({ page, request }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });

    // 1. Admin Events Tab Screenshot
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 8000 });
    await page.getByTestId("tab-admin-events").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(mediaDir, "ui2b1-admin-events-tab-2x.png") });
    console.log("Saved screenshot to:", path.join(mediaDir, "ui2b1-admin-events-tab-2x.png"));

    // 2. Tampered Verify Chain Modal Screenshot
    const tamperData = await tamperAuditRecordDirectSql();

    await page.getByTestId("verify-chain-btn").click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(mediaDir, "ui2b1-verify-chain-tampered-error-2x.png") });
    console.log("Saved screenshot to:", path.join(mediaDir, "ui2b1-verify-chain-tampered-error-2x.png"));

    // Restore pristine state via direct SQL
    await restoreAuditRecordDirectSql(tamperData.tamperedSeq, tamperData.originalHash);

    await page.getByRole("button", { name: "Close Report" }).click();
  });
});
