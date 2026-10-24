import { test, expect } from "@playwright/test";
import * as path from "path";
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

test.describe("Phase 4a Knowledge Base & Policy RAG E2E", () => {
  test("Knowledge Base: loads corpus, views chunks, searches with hybrid RAG, and tests refusal", async ({
    page,
  }) => {
    // 1. Login
    await page.goto("/login");
    await page.getByTestId("dev-session-button").click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.waitForTimeout(500);

    // 2. Navigate to Knowledge Base
    await page.getByTestId("nav-knowledge-base").click();
    await page.waitForURL(/\/app\/knowledge-base/, { timeout: 8000 });
    await page.waitForTimeout(1000);

    await expect(page.getByRole("heading", { name: "Knowledge Base & Policy RAG" })).toBeVisible();
    await expect(page.getByText("BGE-small ONNX")).toBeVisible();

    // 3. Load Sample Docs if not already populated
    const loadSampleBtn = page.getByRole("button", { name: /Load Sample Docs|Load Sample Policies/i }).first();
    if (await loadSampleBtn.isVisible()) {
      await loadSampleBtn.click();
      await page.waitForTimeout(2000);
    }

    // Verify document table contains sample policies
    await expect(page.getByText(/Payments Fraud Policy|Data Handling Policy/i).first()).toBeVisible({
      timeout: 8000,
    });

    // Capture Overview Screenshot
    await page.screenshot({
      path: path.join(mediaDir, "phase4a-knowledge-base-overview.png"),
      fullPage: true,
    });

    // 4. Inspect Document Chunks Modal
    const firstChunksBtn = page.getByRole("button", { name: /Chunks/i }).first();
    await firstChunksBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Sequential Chunks:/i)).toBeVisible();
    await expect(page.getByText(/Chunk #0/i)).toBeVisible();

    // Close modal
    await page.getByRole("button", { name: /Close/i }).click();
    await expect(page.getByText(/Sequential Chunks:/i)).not.toBeVisible();
    await page.waitForTimeout(500);

    // 5. Test "Ask Your Policies" Inspector with in-scope query
    const searchInput = page.getByPlaceholder("Ask a policy question...");
    await searchInput.fill("What is the maximum single-transaction limit for an automated payment agent?");
    await page.getByRole("button", { name: /Search Policy Corpus/i }).click();
    await page.waitForTimeout(1500);

    // Verify search hit
    await expect(page.getByText(/Grounded/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/INR 10,000/i).first()).toBeVisible();

    // Capture Search / Inspector Screenshot
    await page.screenshot({
      path: path.join(mediaDir, "phase4a-rag-grounded-search.png"),
      fullPage: true,
    });

    // 6. Test Refusal on Out-of-Scope Query
    await searchInput.fill("What is the recommended dosage for paracetamol in pediatric patients?");
    await page.getByRole("button", { name: /Search Policy Corpus/i }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText(/Refusal: No Grounded Policy Clauses/i)).toBeVisible({ timeout: 8000 });

    // Save clip
    await page.close();
    const clipPath = path.join(mediaDir, "phase4a-knowledge-base-flow.webm");
    await page.video()?.saveAs(clipPath);
    console.log("Saved video clip to:", clipPath);
  });
});
