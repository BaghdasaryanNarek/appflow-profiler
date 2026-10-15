import { describe, expect, it } from "vitest";
import { computeGraphLayout, computeStructuralFingerprint, LayoutWorkerBridge } from "@/lib/layout";
import type { LayoutNodeInput, LayoutEdgeInput } from "@/lib/layout";

describe("Layout Engine & Structural Fingerprint", () => {
  const sampleNodes: LayoutNodeInput[] = [
    { id: "svc:frontend", kind: "service" },
    { id: "svc:api-gateway", kind: "service" },
    { id: "db:postgres", kind: "datastore" },
  ];

  const sampleEdges: LayoutEdgeInput[] = [
    { id: "e1", source: "svc:frontend", target: "svc:api-gateway" },
    { id: "e2", source: "svc:api-gateway", target: "db:postgres" },
  ];

  describe("computeGraphLayout", () => {
    it("returns empty map for empty node array", () => {
      const positions = computeGraphLayout([], []);
      expect(positions).toEqual({});
    });

    it("positions a single isolated node at default coordinates", () => {
      const positions = computeGraphLayout([{ id: "single", kind: "service" }], []);
      expect(positions["single"]).toEqual({ x: 80, y: 80 });
    });

    it("computes layered deterministic positions for multiple nodes", () => {
      const positions = computeGraphLayout(sampleNodes, sampleEdges, { direction: "RIGHT" });
      expect(Object.keys(positions)).toHaveLength(3);
      expect(positions["svc:frontend"]).toBeDefined();
      expect(positions["svc:api-gateway"]).toBeDefined();
      expect(positions["db:postgres"]).toBeDefined();

      // LR layout: frontend x < api-gateway x < postgres x
      const frontend = positions["svc:frontend"];
      const api = positions["svc:api-gateway"];
      const db = positions["db:postgres"];

      if (!frontend || !api || !db) {
        throw new Error("Missing positions");
      }

      expect(frontend.x).toBeLessThan(api.x);
      expect(api.x).toBeLessThan(db.x);
    });

    it("supports top-to-bottom layout direction", () => {
      const positions = computeGraphLayout(sampleNodes, sampleEdges, { direction: "DOWN" });
      const frontend = positions["svc:frontend"];
      const api = positions["svc:api-gateway"];
      const db = positions["db:postgres"];

      if (!frontend || !api || !db) {
        throw new Error("Missing positions");
      }

      expect(frontend.y).toBeLessThan(api.y);
      expect(api.y).toBeLessThan(db.y);
    });
  });

  describe("computeStructuralFingerprint (Incremental Relayout Invariant)", () => {
    it("produces identical fingerprints regardless of node/edge order", () => {
      const fp1 = computeStructuralFingerprint(
        ["svc:a", "svc:b", "svc:c"],
        [
          { source: "svc:a", target: "svc:b" },
          { source: "svc:b", target: "svc:c" },
        ],
        false,
      );

      const fp2 = computeStructuralFingerprint(
        ["svc:c", "svc:a", "svc:b"],
        [
          { source: "svc:b", target: "svc:c" },
          { source: "svc:a", target: "svc:b" },
        ],
        false,
      );

      expect(fp1).toBe(fp2);
    });

    it("changes fingerprint when a node is added or removed", () => {
      const fpBase = computeStructuralFingerprint(
        ["svc:a", "svc:b"],
        [{ source: "svc:a", target: "svc:b" }],
        false,
      );

      const fpAdded = computeStructuralFingerprint(
        ["svc:a", "svc:b", "svc:c"],
        [{ source: "svc:a", target: "svc:b" }],
        false,
      );

      expect(fpBase).not.toBe(fpAdded);
    });

    it("changes fingerprint when an edge is added or removed", () => {
      const fpBase = computeStructuralFingerprint(
        ["svc:a", "svc:b"],
        [{ source: "svc:a", target: "svc:b" }],
        false,
      );

      const fpEdgeAdded = computeStructuralFingerprint(
        ["svc:a", "svc:b"],
        [
          { source: "svc:a", target: "svc:b" },
          { source: "svc:b", target: "svc:a" },
        ],
        false,
      );

      expect(fpBase).not.toBe(fpEdgeAdded);
    });

    it("changes fingerprint when LOD mode toggles", () => {
      const fpNormal = computeStructuralFingerprint(
        ["svc:a", "svc:b"],
        [{ source: "svc:a", target: "svc:b" }],
        false,
      );

      const fpCollapsed = computeStructuralFingerprint(
        ["svc:a", "svc:b"],
        [{ source: "svc:a", target: "svc:b" }],
        true,
      );

      expect(fpNormal).not.toBe(fpCollapsed);
    });
  });

  describe("LayoutWorkerBridge", () => {
    it("computes layout and caches results with matching fingerprint", async () => {
      const bridge = new LayoutWorkerBridge();
      const fp = "fp-test-123";

      const pos1 = await bridge.computeLayout(sampleNodes, sampleEdges, { direction: "RIGHT" }, fp);
      expect(Object.keys(pos1)).toHaveLength(3);

      // Second call with same fingerprint should return cached positions
      const pos2 = await bridge.computeLayout(sampleNodes, sampleEdges, { direction: "RIGHT" }, fp);
      expect(pos2).toBe(pos1);

      bridge.terminate();
    });

    it("throws error when calling computeLayout on terminated bridge", async () => {
      const bridge = new LayoutWorkerBridge();
      bridge.terminate();

      await expect(bridge.computeLayout(sampleNodes, sampleEdges)).rejects.toThrow(
        "LayoutWorkerBridge has been terminated.",
      );
    });
  });
});
