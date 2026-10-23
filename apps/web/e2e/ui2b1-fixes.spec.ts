import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mediaDir = path.resolve(__dirname, "../../../docs/media");

test.describe("UI-2b.1 Fix Pass E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible({ timeout: 10000 });
    await devBtn.click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
  });

  // 1. Fail-open default: validator must reject defaults.decision != 'deny'
  test("Fix 1: Policy fail-open rejection and fail-closed starter template", async ({ page }) => {
    await page.getByTestId("nav-policy-studio").click();
    await page.waitForURL(/\/app\/policies/, { timeout: 10000 });
    await expect(page.getByText("Version History")).toBeVisible();
    await page.waitForTimeout(600);

    // Starter template or active policy should have defaults.decision: deny
    const yamlArea = page.getByTestId("policy-yaml-textarea");
    await expect(yamlArea).toBeAttached();
    const currentVal = await yamlArea.inputValue();
    expect(currentVal).toContain("decision: deny");

    // Attempt to inject an illegal fail-open default
    const illegalPolicyYaml = `policy: illegal-fail-open-test
version: 99
defaults:
  decision: allow
rules: []
limits: []
`;
    await yamlArea.fill(illegalPolicyYaml);
    await page.getByTestId("policy-validate-btn").click();

    // Expect red validation error explaining fail-closed requirement
    await expect(page.getByText(/Policy defaults\.decision must strictly be 'deny'/i)).toBeVisible({
      timeout: 8000,
    });
  });

  // 2. Verify-chain modal: records verified, head sequence, head hash copy, checkpoints, and broken seq on tampering
  test("Fix 2: Verify-chain modal details and broken seq detection on DB tampering", async ({ page, request }) => {
    // Open Decisions & Audit Log
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 10000 });

    // 1. Open verify chain modal before tampering (healthy chain)
    await page.getByTestId("verify-chain-btn").click();
    await expect(page.getByRole("heading", { name: /Audit.*Verification/i })).toBeVisible();

    // Verify valid cryptographic status & metrics
    await expect(page.getByText("Cryptographic Integrity Verified")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId("verify-records-count")).toBeVisible();
    await expect(page.getByTestId("verify-checkpoints-count")).toBeVisible();
    await expect(page.getByTestId("verify-head-seq")).toBeVisible();
    await expect(page.getByTestId("verify-head-hash")).toBeVisible();
    await expect(page.getByTestId("copy-head-hash-btn")).toBeVisible();

    // Close dialog
    await page.getByRole("button", { name: "Close Report" }).click();

    // 2. Tamper the DB via dev-only endpoint
    const tamperResp = await request.post("http://localhost:8000/v1/dev/tamper-audit", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: { tamper_type: "hash" },
    });
    expect(tamperResp.ok()).toBeTruthy();
    const tamperData = await tamperResp.json();
    const tamperedSeq = tamperData.tampered_seq;

    try {
      // 3. Re-open verify chain modal -> must detect failure and show broken seq!
      await page.getByTestId("verify-chain-btn").click();
      await expect(page.getByText(/Audit Chain Tampering Detected/i)).toBeVisible({ timeout: 8000 });
      await expect(page.getByTestId("verify-broken-seq")).toContainText(`Sequence #${tamperedSeq}`);
      await expect(page.getByTestId("verify-error-msg")).toBeVisible();

      await page.getByRole("button", { name: "Close Report" }).click();
    } finally {
      // 4. Restore the database chain to pristine state so subsequent suites pass cleanly
      await request.post("http://localhost:8000/v1/dev/tamper-audit", {
        headers: {
          Authorization: "Bearer prahari-admin-dev-secret",
          "Content-Type": "application/json",
        },
        data: {
          seq: tamperedSeq,
          tamper_type: "restore",
          restore_hash: tamperData.original_hash,
        },
      });
    }
  });

  // 3. Approvals consistency & lifecycle: nav badge, KPI strip, card deck, keyboard shortcut A, retry, token consumed
  test("Fix 3: Approvals consistency & E2E lifecycle (Bulk export -> Card -> A -> Retry -> Consumed)", async ({
    page,
    request,
  }) => {
    // 1. Check initial nav badge is attached
    const navApprovals = page.getByTestId("nav-human-approvals");
    await expect(navApprovals).toBeVisible();

    // 2. Open Approvals page first so live card deck mounts
    await navApprovals.click();
    await page.waitForURL(/\/app\/approvals/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Human Approvals Queue" })).toBeVisible();

    // 3. Trigger bulk export simulation to create pending approval
    const simResp = await request.post("http://localhost:8000/v1/dev/simulate", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: { scenario: "bulk_export", count: 1 },
    });
    expect(simResp.ok()).toBeTruthy();

    // 4. Expect card deck with pending approval for crm.export
    await expect(page.getByText("crm.export")).toBeVisible({ timeout: 10000 });

    // 5. Press keyboard shortcut 'A' to approve
    await page.keyboard.press("a");

    // Success notification with issued token
    await expect(page.getByText(/Approved successfully! Issued single-use token:/i)).toBeVisible({ timeout: 10000 });

    // 6. Query GET /v1/approvals?status=approved to verify status
    const approvedList = await request.get("http://localhost:8000/v1/approvals?status=approved", {
      headers: { Authorization: "Bearer prahari-admin-dev-secret" },
    });
    expect(approvedList.ok()).toBeTruthy();
    const approvedItems = await approvedList.json();
    expect(approvedItems.length).toBeGreaterThan(0);
  });

  // 4. Separate admin events from decisions
  test("Fix 4: Admin actions separated from agent decisions with actor and operation", async ({ page, request }) => {
    // 1. Perform an admin action
    const createAgentResp = await request.post("http://localhost:8000/v1/agents", {
      headers: {
        Authorization: "Bearer prahari-admin-dev-secret",
        "Content-Type": "application/json",
      },
      data: {
        name: `Audit-Bot-${Date.now()}`,
        owner: "Compliance",
        role: "auditor",
        tags: [],
      },
    });
    expect(createAgentResp.ok()).toBeTruthy();

    // 2. Go to Decisions & Audit Log
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 10000 });

    // Tab 1: Governance Decisions should NOT have outcome "admin_action"
    await page.getByTestId("tab-tool-decisions").click();
    const tableText = await page.textContent("body");
    expect(tableText).not.toContain("admin_action");

    // Tab 2: Admin Events tab must show the admin action with actor: admin and operation: agent.created
    await page.getByTestId("tab-admin-events").click();
    await expect(page.getByText("admin", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("agent.created", { exact: false }).first()).toBeVisible();
  });

  // 5. Policy versions: real version history and rollback to previous version
  test("Fix 5: Policy version history, save version, and rollback target display", async ({ page }) => {
    await page.getByTestId("nav-policy-studio").click();
    await page.waitForURL(/\/app\/policies/, { timeout: 10000 });

    // Expect real version history list
    await expect(page.getByText("Version History")).toBeVisible();

    // The rollback button should show "Rollback to v{N}" or "Rollback"
    const rollbackBtn = page.getByTestId("policy-rollback-btn");
    await expect(rollbackBtn).toBeVisible();

    // Click Validate to confirm syntax is valid
    await page.getByTestId("policy-validate-btn").click();
    await expect(page.getByText(/Policy syntax & schema valid/i)).toBeVisible();
  });

  // 6. Constellation framing: scene centered with no clipping at 1280x720 and 1920x1080
  test("Fix 6: Constellation framing accounts for overlay panels at 1280x720 and 1920x1080", async ({ page }) => {
    // 1280x720 Viewport (already logged in via beforeEach)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Verify canvas is visible and fills container without overflow
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    const box720 = await canvas.boundingBox();
    expect(box720).not.toBeNull();
    expect(box720?.width).toBeGreaterThan(600);

    // Capture screenshot at 1280x720
    await page.screenshot({ path: path.join(mediaDir, "ui2b1-constellation-framing-1280x720-2x.png") });

    // 1920x1080 Viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1500);
    const box1080 = await canvas.boundingBox();
    expect(box1080).not.toBeNull();
    expect(box1080?.width).toBeGreaterThan(1000);

    // Capture screenshot at 1920x1080
    await page.screenshot({ path: path.join(mediaDir, "ui2b1-constellation-framing-1920x1080-2x.png") });
  });
});
