import { describe, expect, it } from "vitest";
import { parseGenericSpans } from "../src/parsers/generic.js";
import { loadFixture } from "./helpers.js";

describe("parseGenericSpans", () => {
  const result = parseGenericSpans(loadFixture("generic-spans.json"));

  it("parses every span in the fixture", () => {
    expect(result.spans).toHaveLength(6);
    expect(result.format).toBe("generic");
  });

  it("accepts both epoch-millisecond and ISO-8601 timestamps", () => {
    const root = result.spans.find((s) => s.id === "span-1")!;
    expect(root.startTime).toBe(1739500800000);
    expect(root.endTime).toBe(1739500802350);

    const llmCall = result.spans.find((s) => s.id === "span-2")!;
    expect(llmCall.startTime).toBe(Date.parse("2025-02-14T02:40:00.050Z"));
    expect(llmCall.endTime).toBe(Date.parse("2025-02-14T02:40:01.200Z"));
  });

  it("preserves parent/child links", () => {
    const httpRequest = result.spans.find((s) => s.id === "span-4")!;
    expect(httpRequest.parentId).toBe("span-3");
    const root = result.spans.find((s) => s.id === "span-1")!;
    expect(root.parentId).toBeNull();
  });

  it("passes through an explicit status", () => {
    const dbQuery = result.spans.find((s) => s.id === "span-5")!;
    expect(dbQuery.status).toBe("error");
    expect((dbQuery.metadata as any).error).toBe("connection reset");
  });

  it("defaults status to ok when omitted", () => {
    const root = result.spans.find((s) => s.id === "span-1")!;
    expect(root.status).toBe("ok");
  });

  it("skips malformed entries and warns instead of throwing", () => {
    const partial = parseGenericSpans([{ id: "x", name: "missing-times" }]);
    expect(partial.spans).toHaveLength(0);
    expect(partial.warnings.length).toBeGreaterThan(0);
  });

  it("de-duplicates repeated ids rather than silently dropping spans", () => {
    const dup = parseGenericSpans([
      { id: "a", name: "first", startTime: 0, endTime: 10 },
      { id: "a", name: "second", startTime: 5, endTime: 15 },
    ]);
    expect(dup.spans).toHaveLength(2);
    expect(new Set(dup.spans.map((s) => s.id)).size).toBe(2);
    expect(dup.warnings.some((w) => w.includes("duplicate id"))).toBe(true);
  });
});
