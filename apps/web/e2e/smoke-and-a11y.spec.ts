import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Public Landing Page Smoke & Interaction", () => {
  test("renders hero, problem section, pipeline topology, and interacts with attack", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("A sentinel for AI agents")).toBeVisible();
    await expect(
      page.getByText("OWASP Top 10 for Agentic Applications"),
    ).toBeVisible();
    await expect(
      page.getByText("The Agent Journey: Intercepting Function Calls"),
    ).toBeVisible();

    // Verify Send an attack button
    const attackBtn = page.getByRole("button", { name: /send an attack/i });
    await expect(attackBtn).toBeVisible();
    await attackBtn.click();

    // Verify shattered alert appears
    await expect(
      page.getByText(/Prompt injection shattered at Gate 03/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("SHATTERED", { exact: true })).toBeVisible();

    // Verify Precedence invariant section
    await expect(
      page.getByText(/How decisions are made: Determinism over heuristics/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Formal Precedence Theorem/i),
    ).toBeVisible();

    // Verify honest disclaimer and status labels
    await expect(
      page.getByText(/Statutory Disclaimer:/i),
    ).toBeVisible();
    await expect(
      page.getByText(/v0.1.0-prealpha/i),
    ).toBeVisible();
  });

  test("runs accessibility scan on Landing Page", async ({ page }) => {
    await page.goto("/");
    // Analyze accessibility with axe-core
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"]) // 3D canvas labels / ambient canvas overlays
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical",
    );
    expect(criticalViolations).toEqual([]);
  });
});

test.describe("Login Page Smoke & Accessibility", () => {
  test("renders split-screen login, inputs, and dev session button", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Operator Sign In")).toBeVisible();
    await expect(page.getByTestId("admin-token-input")).toBeVisible();
    await expect(page.getByTestId("submit-login")).toBeVisible();

    // Dev session button is visible when backend reports ENV=development
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible();
  });

  test("runs accessibility scan on Login Page", async ({ page }) => {
    await page.goto("/login");
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical",
    );
    expect(criticalViolations).toEqual([]);
  });

  test("dev session bypass logs in and redirects to console", async ({
    page,
  }) => {
    await page.goto("/login");
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible();
    await devBtn.click();

    // Should redirect to /app (or /app/constellation)
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/app/);
  });
});
