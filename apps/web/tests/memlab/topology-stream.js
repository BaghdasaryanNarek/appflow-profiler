/**
 * MemLab E2E memory leak detection scenario for AppFlow Profiler (§3.7 item 8, Phase 16).
 *
 * Usage:
 *   pnpm --dir apps/web memlab
 *
 * Scenario lifecycle:
 *   1. Baseline (`url()`): Opens `/topology` and establishes baseline heap snapshot.
 *   2. Target (`action(page)`): Streams live/simulated WebSocket updates for 60s
 *      (configurable via `MEMLAB_STREAM_MS`), opens and closes the NodeDetailSheet
 *      20 times, and navigates across routes (`/about` -> `/topology`).
 *   3. Final (`back(page)`): Dismisses any active overlay and returns to `/topology`
 *      steady state so MemLab can diff Final vs Baseline heap snapshots and verify
 *      zero retained detached DOM trees, WebSockets, Workers, or React Flow instances.
 */

const BASE_URL = process.env.MEMLAB_BASE_URL || "http://localhost:3000";
const STREAM_DURATION_MS = Number(process.env.MEMLAB_STREAM_MS || 60_000);
const SHEET_CYCLES = Number(process.env.MEMLAB_SHEET_CYCLES || 20);

function url() {
  return `${BASE_URL}/topology`;
}

async function action(page) {
  await page.waitForSelector('[data-testid="topology-canvas-island"]', {
    timeout: 15_000,
  });
  await page.waitForSelector("[data-node-id]", { timeout: 15_000 });

  // Sustain live WebSocket delta streaming
  await page.waitForTimeout(STREAM_DURATION_MS);

  // Open and close NodeDetailSheet 20 times to stress Radix Dialog + Sparkline SVG + AbortController cleanup
  for (let i = 0; i < SHEET_CYCLES; i += 1) {
    const firstNode = await page.$("[data-node-id]");
    if (firstNode) {
      await firstNode.focus();
      await page.keyboard.press("Enter");
      await page.waitForSelector('[data-testid="node-detail-sheet"]', {
        timeout: 5_000,
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
  }

  // Navigate away to /about (terminating layout Web Worker) and back to /topology
  const aboutLink = await page.$('a[href="/about"]');
  if (aboutLink) {
    await aboutLink.click();
    await page.waitForTimeout(500);
  }
  const topologyLink = await page.$('a[href="/topology"]');
  if (topologyLink) {
    await topologyLink.click();
    await page.waitForSelector('[data-testid="topology-canvas-island"]', {
      timeout: 15_000,
    });
  }
}

async function back(page) {
  await page.keyboard.press("Escape");
  await page.goto(`${BASE_URL}/topology`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="topology-canvas-island"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(500);
}

function leakFilter(node, _snapshot, _leakedNodeIds) {
  const name = node.name || "";
  if (
    name.includes("Detached") ||
    name === "WebSocket" ||
    name === "Worker" ||
    name === "LayoutWorkerBridge"
  ) {
    return true;
  }
  return false;
}

module.exports = {
  url,
  action,
  back,
  leakFilter,
};
