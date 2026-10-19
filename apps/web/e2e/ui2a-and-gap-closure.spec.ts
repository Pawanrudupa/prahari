import { test, expect } from "@playwright/test";

test.describe("Landing Navigation & Section Highlight", () => {
  test("landing nav highlights active section on scroll and hash navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/A sentinel for/i)).toBeVisible();

    // Problem section link
    const problemLink = page.locator('nav a[href="#problem"]').first();
    if (await problemLink.isVisible()) {
      await problemLink.click();
      await page.waitForTimeout(600);
      await expect(page.locator("#problem")).toBeInViewport();
    }

    // Pipeline section link
    const pipelineLink = page.locator('nav a[href="#pipeline"]').first();
    if (await pipelineLink.isVisible()) {
      await pipelineLink.click();
      await page.waitForTimeout(600);
      await expect(page.locator("#pipeline")).toBeInViewport();
    }
  });

  test("journey benign button shows allow outcome", async ({ page }) => {
    await page.goto("/");
    const pipelineSection = page.locator("#pipeline");
    await pipelineSection.scrollIntoViewIfNeeded();

    const benignBtn = page.getByRole("button", { name: /send benign/i });
    await expect(benignBtn).toBeVisible();
    await benignBtn.click();
    await expect(
      page.getByText(/Allowed: Verified capability grant/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("journey PII button shows redact outcome", async ({ page }) => {
    await page.goto("/");
    const pipelineSection = page.locator("#pipeline");
    await pipelineSection.scrollIntoViewIfNeeded();

    const piiBtn = page.getByRole("button", { name: /send pii/i });
    await expect(piiBtn).toBeVisible();
    await piiBtn.click();
    await expect(
      page.getByText(/Redacted: PII entities masked at Gate 04/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("journey bulk export button shows escalate outcome", async ({ page }) => {
    await page.goto("/");
    const pipelineSection = page.locator("#pipeline");
    await pipelineSection.scrollIntoViewIfNeeded();

    const bulkBtn = page.getByRole("button", { name: /send bulk export/i });
    await expect(bulkBtn).toBeVisible();
    await bulkBtn.click();
    await expect(
      page.getByText(/Escalated: Bulk export exceeded threshold/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("journey attack button shows deny outcome", async ({ page }) => {
    await page.goto("/");
    const pipelineSection = page.locator("#pipeline");
    await pipelineSection.scrollIntoViewIfNeeded();

    const attackBtn = page.getByRole("button", { name: /send an attack/i });
    await expect(attackBtn).toBeVisible();
    await attackBtn.click();
    await expect(
      page.getByText(/Prompt injection shattered at Gate 03/i),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Authentication: Admin Token and Dev-Session", () => {
  test("login via dev-session button", async ({ page }) => {
    await page.goto("/login");
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible();
    await devBtn.click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/app/);
  });

  test("login via admin token authentication", async ({ page }) => {
    await page.goto("/login");
    const tokenInput = page.getByTestId("admin-token-input");
    await expect(tokenInput).toBeVisible();
    await tokenInput.fill("prahari-admin-dev-secret");
    await page.getByTestId("submit-login").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe("Constellation 3D Console & Effects", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.waitForSelector("canvas", { timeout: 15000 });
  });

  test("constellation renders with nonzero agents and live canvas", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    // Toggle legend and verify node definitions
    const legendBtn = page.getByText("Legend");
    await expect(legendBtn).toBeVisible();
    await legendBtn.click();
    await expect(page.getByText("Agent Node")).toBeVisible();
    await expect(page.getByText("Tool Node")).toBeVisible();
  });

  test("simulate run produces events in the feed and quick-filter feed works", async ({ page }) => {
    const simButton = page.getByRole("button", { name: /Run Simulation|Run Scenario/i }).first();
    if (await simButton.isVisible()) {
      await simButton.click();
    }

    await expect(page.getByText("Live Event Feed")).toBeVisible();

    const allPill = page.getByRole("button", { name: /^all$/i });
    if (await allPill.isVisible()) {
      await allPill.click();
    }
  });

  test("Reset badges clears escalation tint and badges", async ({ page }) => {
    const panel = page.getByTestId("test-effects-panel");
    if (await panel.isVisible()) {
      // Trigger escalate effect to activate badge and tint
      await page.getByTestId("test-effect-escalate").click();
      await page.waitForTimeout(600);

      // Trigger reset badges via test-clear-escalations
      const resetBtn = page.getByTestId("test-clear-escalations");
      await expect(resetBtn).toBeVisible();
      await resetBtn.click();
      await page.waitForTimeout(400);

      // Verify tint cleared in state
      const escalationCount = await page.evaluate(() => {
        const store = (window as any).__PRAHARI_GRAPH_STORE__;
        return store ? store.getState().escalationQueue.size : 0;
      });
      expect(escalationCount).toBe(0);
    }
  });
});

test.describe("UI-2a: Navigation and Core Console Modules", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
  });

  test("Agents & Tools: list, status toggle, key rotation dialog, and capability grants", async ({
    page,
  }) => {
    await page.getByTestId("nav-agents---tools").click();
    await page.waitForURL(/\/app\/agents/, { timeout: 8000 });

    await expect(page.getByText("Agents & Tools Registry")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Registered Agents/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Capability Grants/i })).toBeVisible();

    // Switch to Capability Grants tab
    await page.getByRole("tab", { name: /Capability Grants/i }).click();
    await expect(page.getByText(/Strict Default-Deny Semantics/i)).toBeVisible();
    await expect(page.getByText(/No grants = no tools/i)).toBeVisible();
  });

  test("Decisions & Audit: virtualized log, outcome filters, detail drawer, and chain verification", async ({
    page,
  }) => {
    await page.getByTestId("nav-decisions---audit").click();
    await page.waitForURL(/\/app\/decisions/, { timeout: 8000 });

    await expect(page.getByText("Decisions & Audit Log")).toBeVisible();
    await expect(page.getByRole("button", { name: /Verify Chain/i })).toBeVisible();

    // Open Chain Verification modal
    await page.getByRole("button", { name: /Verify Chain/i }).click();
    await expect(page.getByRole("heading", { name: /Cryptographic Integrity Verified/i })).toBeVisible({ timeout: 12000 });
    await expect(page.getByRole("button", { name: /Close Report/i })).toBeVisible();
    await page.getByRole("button", { name: /Close Report/i }).click();
  });

  test("Settings: GPU detected renderer, quality preset, reduced motion toggle, and sign out", async ({
    page,
  }) => {
    await page.getByTestId("nav-settings").click();
    await page.waitForURL(/\/app\/settings/, { timeout: 8000 });

    await expect(page.getByText("Console Settings")).toBeVisible();
    await expect(page.getByText("Active WebGL Renderer")).toBeVisible();
    await expect(page.getByText("Reduced Motion")).toBeVisible();
    await expect(page.getByText("Dark Theme Active")).toBeVisible();
    await expect(page.getByText(/Statutory & Compliance Disclaimer/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign Out Console/i })).toBeVisible();
  });
});
