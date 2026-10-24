import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { clearPolicyCorpusDirectSql } from "./helpers/directSqlAuditTamper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mediaDir = path.resolve(__dirname, "../../../docs/media");
const sampleDocPath = path.resolve(
  __dirname,
  "../../../policies/examples/docs/payments-fraud-policy.md"
);

test.use({
  video: {
    mode: "on",
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 720 },
});

test.describe("Phase 4a Knowledge Base & Policy RAG E2E", () => {
  test("Continuous Flow: empty KB -> Load Sample Docs -> chunk viewer -> grounded query -> refusal -> duplicate upload rejected -> archive doc", async ({
    page,
  }) => {
    test.setTimeout(75000);

    // 0. Ensure clean empty corpus state via direct SQL
    await clearPolicyCorpusDirectSql();

    // 1. Login
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.waitForTimeout(500);

    // 2. Navigate to Knowledge Base (Empty state)
    await page.getByTestId("nav-knowledge-base").click();
    await page.waitForURL(/\/app\/knowledge-base/, { timeout: 8000 });
    await page.waitForTimeout(1000);

    await expect(page.getByRole("heading", { name: "Knowledge Base & Policy RAG" })).toBeVisible();
    await expect(page.getByText(/No policy documents found/i)).toBeVisible();
    await page.waitForTimeout(1500);

    // 3. Click Load Sample Policies
    const loadSampleBtn = page.getByRole("button", { name: /Load Sample Policies|Load Sample Docs/i }).first();
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();

    // Verify 4 documents populated
    await expect(page.getByText("Payments Fraud Policy")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Data Handling Policy")).toBeVisible();
    await page.waitForTimeout(1500);

    // 4. Open Chunk Viewer Modal
    const firstChunksBtn = page.getByRole("button", { name: /Chunks/i }).first();
    await firstChunksBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Sequential Chunks:/i)).toBeVisible();
    await expect(page.getByText(/Chunk #0/i)).toBeVisible();
    await page.waitForTimeout(2000);

    // Close Chunk Viewer Modal
    await page.getByRole("button", { name: /Close/i }).click();
    await expect(page.getByText(/Sequential Chunks:/i)).not.toBeVisible();
    await page.waitForTimeout(1000);

    // 5. Grounded Query with Full Result Visible
    const searchInput = page.getByPlaceholder("Ask a policy question...");
    await searchInput.fill("What is the maximum single-transaction limit for an automated payment agent?");
    await page.getByRole("button", { name: /Search Policy Corpus/i }).click();

    // Verify hit
    await expect(page.getByText(/Grounded/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/INR 10,000/i).first()).toBeVisible();
    await page.waitForTimeout(2000);

    // 6. Near-Domain Refusal
    await searchInput.fill("What is the maritime salvage compensation formula for abandoned cargo vessels?");
    await page.getByRole("button", { name: /Search Policy Corpus/i }).click();

    await expect(page.getByText(/Refusal: No Grounded Policy Clauses/i)).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(2000);

    // 7. Duplicate Upload Rejected
    await page.locator('input[type="file"]').setInputFiles(sampleDocPath);
    await page.waitForTimeout(500);

    // Click Upload & Index
    await page.getByRole("button", { name: /Upload & Index/i }).click();

    // Expect HTTP 409 rejection message in UI
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(2000);

    // Auto-accept confirmation dialogs
    page.on("dialog", (dialog) => dialog.accept());

    // 8. Archive a Document
    const archiveButtons = page.getByTestId("archive-doc-btn");
    await expect(archiveButtons.first()).toBeVisible({ timeout: 5000 });
    const countBefore = await archiveButtons.count();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    await archiveButtons.last().click();
    await page.waitForTimeout(2000);

    // Active documents count should decrease
    const countAfter = await archiveButtons.count();
    expect(countAfter).toBe(countBefore - 1);
    await page.waitForTimeout(2000);

    // Close page to flush video
    await page.close();
    const clipPath = path.join(mediaDir, "phase4a-knowledge-base-flow.webm");
    await page.video()?.saveAs(clipPath);
    console.log("Saved video clip to:", clipPath);
  });
});
