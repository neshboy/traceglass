import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/render/layout.js";
import { parseGenericSpans } from "../src/parsers/generic.js";
import { parseMCPLog } from "../src/parsers/mcp.js";
import { loadFixture } from "./helpers.js";
import type { Span } from "../src/types.js";

describe("computeLayout", () => {
  it("flattens the tree in depth-first order and assigns correct depths", () => {
    const { spans } = parseGenericSpans(loadFixture("generic-spans.json"));
    const layout = computeLayout(spans);

    const order = layout.nodes.map((n) => `${n.span.id}@${n.depth}`);
    expect(order).toEqual([
      "span-1@0",
      "span-2@1",
      "span-3@1",
      "span-4@2",
      "span-5@2",
      "span-6@1",
    ]);

    // rowIndex should match position in the flattened array
    layout.nodes.forEach((node, i) => expect(node.rowIndex).toBe(i));
  });

  it("computes x/width as real percentages of the total trace duration", () => {
    const { spans } = parseGenericSpans(loadFixture("generic-spans.json"));
    const layout = computeLayout(spans);
    const traceStart = 1739500800000;
    const totalDuration = 2350;

    const byId = new Map(layout.nodes.map((n) => [n.span.id, n]));

    const root = byId.get("span-1")!;
    expect(root.xPercent).toBeCloseTo(0, 5);
    expect(root.widthPercent).toBeCloseTo(100, 5);

    const httpRequest = byId.get("span-4")!;
    const expectedX = ((httpRequest.span.startTime - traceStart) / totalDuration) * 100;
    const expectedWidth = ((httpRequest.span.endTime - httpRequest.span.startTime) / totalDuration) * 100;
    expect(httpRequest.xPercent).toBeCloseTo(expectedX, 5);
    expect(httpRequest.widthPercent).toBeCloseTo(expectedWidth, 5);
  });

  it("nests multi-level MCP tool calls (root -> store_result -> write_to_cache)", () => {
    const { spans } = parseMCPLog(loadFixture("mcp-session.json"));
    const layout = computeLayout(spans);
    const byId = new Map(layout.nodes.map((n) => [n.span.id, n]));

    expect(byId.get("1")!.depth).toBe(0);
    expect(byId.get("4")!.depth).toBe(1);
    expect(byId.get("5")!.depth).toBe(2);
    expect(byId.get("5")!.span.parentId).toBe("4");
  });

  it("builds each parent's children array from its actual descendants", () => {
    const { spans } = parseMCPLog(loadFixture("mcp-session.json"));
    const layout = computeLayout(spans);
    const root = layout.nodes.find((n) => n.span.id === "1")!;
    const childIds = root.children.map((c) => c.span.id).sort();
    expect(childIds).toEqual(["2", "3", "4", "6", "7-pending-1771063200470", "notif-0"].sort());
  });

  it("treats an unknown parentId as a root and warns instead of throwing", () => {
    const spans: Span[] = [
      { id: "a", name: "a", startTime: 0, endTime: 10, parentId: "does-not-exist", status: "ok" },
    ];
    const layout = computeLayout(spans);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].depth).toBe(0);
    expect(layout.warnings.some((w) => w.includes("unknown parentId"))).toBe(true);
  });

  it("breaks a parent-cycle instead of infinite-looping", () => {
    const spans: Span[] = [
      { id: "a", name: "a", startTime: 0, endTime: 10, parentId: "b", status: "ok" },
      { id: "b", name: "b", startTime: 0, endTime: 10, parentId: "a", status: "ok" },
    ];
    const layout = computeLayout(spans);
    // Both nodes still get rendered (as roots, since the cycle is broken), none lost.
    expect(layout.nodes.map((n) => n.span.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty layout for an empty span list", () => {
    const layout = computeLayout([]);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.totalDuration).toBe(0);
  });
});
