import { describe, expect, it } from "vitest";
import { parseMCPLog } from "../src/parsers/mcp.js";
import { loadFixture } from "./helpers.js";

function ms(iso: string): number {
  return Date.parse(iso);
}

describe("parseMCPLog", () => {
  const result = parseMCPLog(loadFixture("mcp-session.json"));

  it("produces one span per request/response pair, plus notifications and unmatched requests", () => {
    // 6 request/response pairs (ids 1-6) + 1 notification + 1 unmatched request (id 7) = 8
    expect(result.spans).toHaveLength(8);
    expect(result.format).toBe("mcp");
  });

  it("correlates request and response by id and computes real durations", () => {
    const fetchData = result.spans.find((s) => s.id === "2")!;
    expect(fetchData).toBeDefined();
    expect(fetchData.name).toBe("tools/call: fetch_data");
    expect(fetchData.startTime).toBe(ms("2026-02-14T10:00:00.010Z"));
    expect(fetchData.endTime).toBe(ms("2026-02-14T10:00:00.130Z"));
    expect(fetchData.endTime - fetchData.startTime).toBe(120);
    expect(fetchData.status).toBe("ok");
    expect((fetchData.metadata as any).result).toEqual({
      content: [{ type: "text", text: "1024 rows fetched" }],
    });
  });

  it("keeps the root span's own duration correct even though it encloses children", () => {
    const root = result.spans.find((s) => s.id === "1")!;
    expect(root.name).toBe("tools/call: run_pipeline");
    expect(root.parentId).toBeNull();
    expect(root.endTime - root.startTime).toBe(700);
  });

  it("nests a sub-call under its parent tool call (multi-level nesting)", () => {
    const writeToCache = result.spans.find((s) => s.id === "5")!;
    expect(writeToCache.name).toBe("tools/call: write_to_cache");
    expect(writeToCache.parentId).toBe("4");
    expect(writeToCache.endTime - writeToCache.startTime).toBe(55);

    const storeResult = result.spans.find((s) => s.id === "4")!;
    expect(storeResult.parentId).toBe("1");
  });

  it("marks a response with an error field as an error span", () => {
    const validate = result.spans.find((s) => s.id === "6")!;
    expect(validate.status).toBe("error");
    expect((validate.metadata as any).error).toEqual({
      code: -32001,
      message: "Schema validation failed: missing column 'checksum'",
    });
  });

  it("represents a notification (no id) as a zero-duration span", () => {
    const notif = result.spans.find((s) => s.name.startsWith("notifications/progress"));
    expect(notif).toBeDefined();
    expect(notif!.startTime).toBe(notif!.endTime);
    expect(notif!.parentId).toBe("1");
  });

  it("represents a request with no matching response as pending, and warns about it", () => {
    const pending = result.spans.find((s) => s.status === "pending");
    expect(pending).toBeDefined();
    expect(pending!.name).toBe("tools/call: slow_operation");
    expect(result.warnings.some((w) => w.includes("id=7") && w.includes("never received a response"))).toBe(true);
  });

  it("returns an empty result with a warning for non-array input", () => {
    const bad = parseMCPLog({ not: "an array" });
    expect(bad.spans).toHaveLength(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });

  it("warns instead of crashing on a response with an unknown id", () => {
    const orphan = parseMCPLog([
      { timestamp: "2026-01-01T00:00:00.000Z", jsonrpc: "2.0", id: 99, result: {} },
    ]);
    expect(orphan.spans).toHaveLength(0);
    expect(orphan.warnings.some((w) => w.includes("no matching request"))).toBe(true);
  });
});
