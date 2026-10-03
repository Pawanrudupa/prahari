import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Public Landing Page Smoke & Interaction", () => {
  test("renders hero, problem section, pipeline topology, and interacts with all 4 simulation buttons", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/A sentinel for/i)).toBeVisible();
    await expect(
      page.getByText("OWASP Top 10 for Agentic Applications"),
    ).toBeVisible();
    await expect(
      page.getByText("The Agent Journey: Intercepting Function Calls"),
    ).toBeVisible();

    // Scroll pipeline section into view
    const pipelineSection = page.locator("#pipeline");
    await pipelineSection.scrollIntoViewIfNeeded();

    // Verify 4 simulation buttons exist
    await expect(page.getByRole("button", { name: /send benign/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send pii/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send bulk export/i })).toBeVisible();
    const attackBtn = page.getByRole("button", { name: /send an attack/i });
    await expect(attackBtn).toBeVisible();

    // Trigger attack simulation
    await attackBtn.click();
    await expect(
      page.getByText(/Prompt injection shattered at Gate 03/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#pipeline").getByText("DENY").first()).toBeVisible();

    // Trigger benign simulation
    const benignBtn = page.getByRole("button", { name: /send benign/i });
    await expect(benignBtn).toBeEnabled({ timeout: 10000 });
    await benignBtn.click();
    await expect(
      page.getByText(/Allowed: Verified capability grant/i),
    ).toBeVisible({ timeout: 10000 });

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

  test("dev session bypass logs in and renders Constellation HD console", async ({
    page,
  }) => {
    await page.goto("/login");
    const devBtn = page.getByTestId("dev-session-button");
    await expect(devBtn).toBeVisible();
    await devBtn.click();

    // Should redirect to /app (or /app/constellation)
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/app/);

    // Verify KPI Strip elements
    await expect(page.getByText(/Rate:/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/p95:/i)).toBeVisible();
    await expect(page.getByText(/Ledger:/i)).toBeVisible();

    // Verify Camera Presets
    await expect(page.getByRole("button", { name: /overview/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /follow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /top-down/i })).toBeVisible();

    // Verify Live Event Feed & Legend
    await expect(page.getByText("Live Event Feed")).toBeVisible();
    await expect(page.getByText("Legend")).toBeVisible();

    // Verify Simulator Controller
    await expect(page.getByText("SIMULATOR:")).toBeVisible();
  });
});
