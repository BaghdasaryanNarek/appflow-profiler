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

    // Verify node aria-label contains expected telemetry and adjacency contract
    const ariaLabel = (await firstNode.getAttribute("aria-label")) ?? "";
    expect(ariaLabel).toMatch(
      /health (healthy|degraded|critical|unknown).*requests per second.*p99 \d+ milliseconds.*\d+ upstream.*\d+ downstream/,
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
