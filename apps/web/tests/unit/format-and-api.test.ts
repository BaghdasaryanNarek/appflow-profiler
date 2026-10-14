import { describe, expect, it, vi } from "vitest";
import {
  formatBytes,
  formatCompactNumber,
  formatDuration,
  formatLatencyMs,
  formatPercent,
  formatRps,
} from "@/lib/format";
import {
  ApiProblemError,
  isApiProblemError,
  fetchMeta,
  fetchTopologySummary,
  fetchTopologySnapshot,
  activateScenario,
  resetSimulation,
} from "@/lib/api";

describe("Formatting Helpers (format.ts)", () => {
  describe("formatBytes", () => {
    it("formats bytes accurately across units", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-100)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1048576 * 2.5)).toBe("2.5 MB");
      expect(formatBytes(1073741824 * 3.25)).toBe("3.25 GB");
    });
  });

  describe("formatRps", () => {
    it("formats request rates with appropriate unit suffix", () => {
      expect(formatRps(0)).toBe("0 rps");
      expect(formatRps(4.5)).toBe("4.5 rps");
      expect(formatRps(250)).toBe("250 rps");
      expect(formatRps(1500)).toBe("1.5k rps");
      expect(formatRps(2500000)).toBe("2.5M rps");
    });
  });

  describe("formatLatencyMs", () => {
    it("formats latency in ms and seconds", () => {
      expect(formatLatencyMs(0)).toBe("0 ms");
      expect(formatLatencyMs(0.45)).toBe("0.45 ms");
      expect(formatLatencyMs(8.4)).toBe("8.4 ms");
      expect(formatLatencyMs(125)).toBe("125 ms");
      expect(formatLatencyMs(1500)).toBe("1.50 s");
      expect(formatLatencyMs(2450)).toBe("2.45 s");
    });
  });

  describe("formatPercent", () => {
    it("formats fractions to percentage strings", () => {
      expect(formatPercent(0)).toBe("0.0%");
      expect(formatPercent(0.05)).toBe("5.0%");
      expect(formatPercent(0.852)).toBe("85.2%");
      expect(formatPercent(1.0)).toBe("100.0%");
      expect(formatPercent(1.5)).toBe("100.0%");
    });
  });

  describe("formatCompactNumber", () => {
    it("formats numbers in compact notation", () => {
      expect(formatCompactNumber(500)).toBe("500");
      expect(formatCompactNumber(1200)).toBe("1.2K");
      expect(formatCompactNumber(4500000)).toBe("4.5M");
    });
  });

  describe("formatDuration", () => {
    it("formats durations into human strings", () => {
      expect(formatDuration(0)).toBe("0s");
      expect(formatDuration(45)).toBe("45s");
      expect(formatDuration(75)).toBe("1m 15s");
      expect(formatDuration(3665)).toBe("1h 1m");
    });
  });
});

describe("Typed REST Client & RFC 9457 Problem Details", () => {
  it("instantiates ApiProblemError with problem details and type guard passes", () => {
    const error = new ApiProblemError({
      type: "https://example.com/probs/out-of-bounds",
      title: "Out of Bounds",
      status: 400,
      detail: "Parameter 'kinds' contains invalid value",
      instance: "/api/v1/topology/snapshot",
      retryAfterMs: 5000,
    });

    expect(isApiProblemError(error)).toBe(true);
    expect(isApiProblemError(new Error("Generic"))).toBe(false);
    expect(error.status).toBe(400);
    expect(error.type).toBe("https://example.com/probs/out-of-bounds");
    expect(error.title).toBe("Out of Bounds");
    expect(error.detail).toBe("Parameter 'kinds' contains invalid value");
    expect(error.instance).toBe("/api/v1/topology/snapshot");
    expect(error.retryAfterMs).toBe(5000);
    expect(error.message).toContain("Out of Bounds: Parameter 'kinds' contains invalid value");
  });

  it("handles successful JSON requests", async () => {
    const mockData = { version: "0.1.0", mode: "demo" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(mockData),
    } as Response);

    const result = await fetchMeta();
    expect(result).toEqual(mockData);
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("handles 204 No Content responses cleanly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);

    await resetSimulation();
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("parses application/problem+json and Retry-After header on error", async () => {
    const problemPayload = {
      type: "https://httpstatuses.io/429",
      title: "Too Many Requests",
      status: 429,
      detail: "Scenario activation rate limit exceeded (1 per 10s)",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({
        "content-type": "application/problem+json",
        "retry-after": "10",
      }),
      json: () => Promise.resolve(problemPayload),
    } as Response);

    try {
      await activateScenario("request-storm");
      expect.unreachable();
    } catch (err) {
      expect(isApiProblemError(err)).toBe(true);
      const apiErr = err as ApiProblemError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.retryAfterMs).toBe(10000);
      expect(apiErr.detail).toContain("Scenario activation rate limit exceeded");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
      }
      return Promise.resolve(new Response());
    });

    await expect(fetchTopologySummary({ signal: controller.signal })).rejects.toThrow();
    fetchSpy.mockRestore();
  });

  it("correctly serializes array query parameters for topology snapshot", async () => {
    const mockSnapshot = { seq: 10, graph: { nodes: [], edges: [] } };
    let capturedUrl = "";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce((url) => {
      if (typeof url === "string") {
        capturedUrl = url;
      } else if (url instanceof URL) {
        capturedUrl = url.href;
      } else {
        capturedUrl = url.url;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockSnapshot),
      } as Response);
    });

    await fetchTopologySnapshot({
      kinds: ["service", "datastore"],
      minRps: 15.5,
      group: "svc:orders",
    });

    expect(capturedUrl).toContain("kinds=service");
    expect(capturedUrl).toContain("kinds=datastore");
    expect(capturedUrl).toContain("min_rps=15.5");
    expect(capturedUrl).toContain("group=svc%3Aorders");
    fetchSpy.mockRestore();
  });
});
