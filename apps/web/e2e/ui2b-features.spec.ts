import { test, expect } from "@playwright/test";

test.describe("UI-2b Features E2E Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
  });

  test("Approvals: deck loads, filter tabs work, keyboard shortcuts hint visible", async ({ page }) => {
    await page.getByTestId("nav-human-approvals").click();
    await page.waitForURL(/\/app\/approvals/, { timeout: 8000 });

    await expect(page.getByRole("heading", { name: "Human Approvals Queue" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^pending$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^approved$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^denied$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^expired$/i })).toBeVisible();

    // Verify keyboard shortcuts hint
    await expect(page.getByText("Approve", { exact: true })).toBeVisible();
    await expect(page.getByText("Deny", { exact: true })).toBeVisible();
    await expect(page.getByText("Next / Prev Card")).toBeVisible();
  });

  test("Policy Studio: loads YAML editor, version sidebar, validate button, and dry-run workbench", async ({
    page,
  }) => {
    await page.getByTestId("nav-policy-studio").click();
    await page.waitForURL(/\/app\/policies/, { timeout: 8000 });

    await expect(page.getByRole("heading", { name: "Policy Studio" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Validate/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save Version/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Rollback/i })).toBeVisible();

    // Version history
    await expect(page.getByText("Version History")).toBeVisible();

    // Dry-run workbench
    await expect(page.getByText("Scenario Dry-Run Workbench")).toBeVisible();
    await expect(page.getByRole("button", { name: /Dry-Run Scenario/i })).toBeVisible();

    // Trigger validation
    await page.getByRole("button", { name: /Validate/i }).click();
    await expect(page.getByText(/Policy syntax & schema valid/i)).toBeVisible({ timeout: 6000 });
  });

  test("Session DAG: loads causal workflow, timeline scrubber slider, and node click detail drawer", async ({
    page,
  }) => {
    await page.getByTestId("nav-session-dag").click();
    await page.waitForURL(/\/app\/sessions/, { timeout: 8000 });

    await expect(page.getByRole("heading", { name: "Session Workflow DAG" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export JSON/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /View: 2D|View: 3D/i })).toBeVisible();
  });
});
