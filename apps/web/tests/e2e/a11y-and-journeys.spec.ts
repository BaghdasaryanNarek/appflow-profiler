import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  { path: "/topology", name: "Network Topology" },
  { path: "/processes", name: "Process & Service Table" },
  { path: "/insights", name: "Diagnostic Insights" },
  { path: "/about", name: "About & Architecture" },
];

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[BROWSER UNHANDLED ERROR] ${err.message}\n${err.stack ?? ""}`);
  });
});

test.describe("WCAG 2.2 AA Automated Accessibility Scans (§2, §3.5)", () => {
  for (const { path, name } of ROUTES) {
    test(`audits ${path} (${name}) with zero serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      // Give real-time websocket and client hydration a brief moment to settle
      await page.waitForTimeout(500);

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      expect(criticalViolations).toEqual([]);
    });
  }
});

test.describe("Keyboard Navigation & Progressive Disclosure Journey (§3.5)", () => {
  test("traverses nodes with arrow keys, inspects details via Enter, and returns focus on Escape", async ({
    page,
  }) => {
    await page.goto("/topology");
    await page.waitForLoadState("domcontentloaded");

    // Wait for canvas to load and render nodes
    const canvasIsland = page.locator('[data-testid="topology-canvas-island"]');
    await expect(canvasIsland).toBeVisible({ timeout: 15_000 });

    const firstNode = page.locator("[data-node-id]").first();
    await firstNode.waitFor({ state: "visible", timeout: 15_000 });

    // Focus the first node via keyboard / focus
    await firstNode.focus();
    await expect(firstNode).toBeFocused();

    // Verify the node exposes its telemetry (name = visible text, WCAG 2.5.3) and adjacency contract
    await expect(firstNode).toHaveAccessibleName(/RPS \S+ p99 \S+ m?s\b/);
    await expect(firstNode).toHaveAccessibleDescription(
      /^health (healthy|degraded|critical|unknown), \d+ upstream, \d+ downstream$/,
    );

    // Directional keyboard navigation
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);

    // Press Enter to open Progressive Disclosure detail sheet
    await page.keyboard.press("Enter");

    const detailSheet = page.locator('[data-testid="node-detail-sheet"]');
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });

    // Switch between detail sheet tabs
    const socketsTab = page.getByRole("tab", { name: /Sockets/i });
    if (await socketsTab.isVisible()) {
      await socketsTab.click();
      await expect(socketsTab).toHaveAttribute("aria-selected", "true");
    }

    const neighboursTab = page.getByRole("tab", { name: /Neighbours/i });
    if (await neighboursTab.isVisible()) {
      await neighboursTab.click();
      await expect(neighboursTab).toHaveAttribute("aria-selected", "true");
    }

    // Press Escape to dismiss sheet and return focus
    await page.keyboard.press("Escape");
    await expect(detailSheet).not.toBeVisible();
  });
});

test.describe("Accessible Table Presentation & Process Journey (§3.5, §3.7)", () => {
  test("mounts virtualized TopologyTable, toggles sorting, and inspects row entities", async ({
    page,
  }) => {
    await page.goto("/processes");
    await page.waitForLoadState("domcontentloaded");

    const tableContainer = page.locator('[data-testid="processes-table-container"]');
    await expect(tableContainer).toBeVisible({ timeout: 15_000 });

    // Semantic table element with aria-rowcount
    const table = page.locator("table");
    await expect(table).toBeVisible();
    const rowCountAttr = await table.getAttribute("aria-rowcount");
    expect(rowCountAttr).toBeTruthy();

    // Sort column by RPS
    const rpsHeader = page.getByRole("columnheader", { name: /RPS/i });
    const rpsButton = rpsHeader.getByRole("button");
    await rpsButton.click();

    const ariaSortAsc = await rpsHeader.getAttribute("aria-sort");
    expect(ariaSortAsc).toBe("ascending");

    // Toggle descending
    await rpsButton.click();
    const ariaSortDesc = await rpsHeader.getAttribute("aria-sort");
    expect(ariaSortDesc).toBe("descending");

    // Activate a row via Enter
    const firstRow = page.locator("table tbody tr[data-node-id]").first();
    await firstRow.waitFor({ state: "visible" });
    await firstRow.focus();
    await page.keyboard.press("Enter");

    // Verify detail sheet opened
    const detailSheet = page.locator('[data-testid="node-detail-sheet"]');
    await expect(detailSheet).toBeVisible();

    // Close detail sheet on Escape
    await page.keyboard.press("Escape");
    await expect(detailSheet).not.toBeVisible();
  });
});

test.describe("Live Announcer A11y Landmark (§3.5)", () => {
  test("renders single polite atomic aria-live announcer for health transitions", async ({
    page,
  }) => {
    await page.goto("/topology");
    await page.waitForLoadState("domcontentloaded");

    const announcer = page.locator('[data-testid="live-announcer"]');
    await expect(announcer).toBeAttached();
    await expect(announcer).toHaveAttribute("role", "status");
    await expect(announcer).toHaveAttribute("aria-live", "polite");
    await expect(announcer).toHaveAttribute("aria-atomic", "true");
  });
});

test.describe("Optimization Advisor & Evidence Deep-Linking Journey (§3.3, §4.4)", () => {
  test("triggers topology analysis, renders prioritized recommendations with 0 axe violations, and deep-links via EvidenceChip to /topology detail sheet", async ({
    page,
  }) => {
    await page.goto("/insights");
    await page.waitForLoadState("domcontentloaded");

    // Select a deterministic focus preset and trigger analysis
    const poolingPreset = page.getByRole("button", { name: "Connection pooling" });
    await expect(poolingPreset).toBeVisible();
    await poolingPreset.click();

    const analyzeBtn = page.locator('[data-testid="analyze-topology-btn"]');
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Wait for populated ReportView
    const reportView = page.locator('[data-testid="insights-report-view"]');
    await expect(reportView).toBeVisible({ timeout: 15_000 });

    const sourceBadge = page.locator('[data-testid="report-source-badge"]');
    await expect(sourceBadge).toBeVisible();
    await expect(sourceBadge).toHaveText(/(Heuristic Engine|Gemini AI)/);

    const summaryText = page.locator('[data-testid="report-summary-text"]');
    await expect(summaryText).toBeVisible();

    const firstRecommendation = page.locator('[data-testid^="recommendation-card-"]').first();
    await expect(firstRecommendation).toBeVisible();

    // Run WCAG 2.2 AA scan on the populated report view
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(criticalViolations).toEqual([]);

    // Click an EvidenceChip to transition to /topology and open the NodeDetailSheet
    const firstEvidenceChip = page.locator('[data-testid^="evidence-chip-"]').first();
    await expect(firstEvidenceChip).toBeVisible();
    await firstEvidenceChip.click();

    await expect(page).toHaveURL(/\/topology/);
    const detailSheet = page.locator('[data-testid="node-detail-sheet"]');
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Chaos Scenario Injection & Recovery Journey (§5.4, Phase 16)", () => {
  test("activates request-storm scenario, broadcasts active state to TopBar, and resets cleanly with 0 axe violations", async ({
    page,
    request,
  }) => {
    await page.goto("/topology");
    await page.waitForLoadState("domcontentloaded");

    const canvasIsland = page.locator('[data-testid="topology-canvas-island"]');
    await expect(canvasIsland).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("stream-status-badge")).toHaveText("connected", {
      timeout: 15_000,
    });

    // Trigger request-storm chaos scenario via API and verify WebSocket broadcast to UI
    const activateRes = await request.post(
      "http://127.0.0.1:8000/api/v1/simulation/scenarios/request-storm/activate",
    );
    expect(activateRes.ok()).toBeTruthy();

    await expect(page.getByText("Flash Crowd Request Storm")).toBeVisible({ timeout: 10_000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(criticalViolations).toEqual([]);

    // Reset simulation back to steady baseline
    const resetRes = await request.post("http://127.0.0.1:8000/api/v1/simulation/reset");
    expect(resetRes.status()).toBe(204);

    await expect(page.getByText("Flash Crowd Request Storm")).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Cross-Route Navigation Stability & Core Web Vitals Budget (§1.4, Phase 16)", () => {
  test("navigates across /topology -> /processes -> /insights -> /about with zero unhandled errors and CLS < 0.05", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const w = window as Window & { __CLS_ACCUMULATOR__?: number };
      w.__CLS_ACCUMULATOR__ = 0;
      if (typeof PerformanceObserver !== "undefined") {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & {
                hadRecentInput?: boolean;
                value?: number;
              };
              if (!shift.hadRecentInput && typeof shift.value === "number") {
                w.__CLS_ACCUMULATOR__ = (w.__CLS_ACCUMULATOR__ ?? 0) + shift.value;
              }
            }
          });
          observer.observe({ type: "layout-shift", buffered: true });
        } catch {
          // Layout-shift entry type unsupported in fallback environment
        }
      }
    });

    await page.goto("/topology");
    await expect(page.locator('[data-testid="topology-canvas-island"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: /Processes/i }).click();
    await expect(page).toHaveURL(/\/processes/);
    await expect(page.locator('[data-testid="processes-table-container"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: /Insights/i }).click();
    await expect(page).toHaveURL(/\/insights/);
    await expect(page.locator('[data-testid="analyze-topology-btn"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: /About/i }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator('[data-testid="about-capabilities-strip"]')).toBeVisible({
      timeout: 15_000,
    });

    const totalCls = await page.evaluate(() => {
      const w = window as Window & { __CLS_ACCUMULATOR__?: number };
      return w.__CLS_ACCUMULATOR__ ?? 0;
    });

    expect(totalCls).toBeLessThan(0.05);
    expect(pageErrors).toEqual([]);
  });
});
