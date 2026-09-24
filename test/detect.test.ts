import { describe, expect, it } from "vitest";
import { detectFormat, parseTrace, UnknownTraceFormatError } from "../src/parsers/detect.js";
import { loadFixture } from "./helpers.js";

describe("detectFormat / parseTrace", () => {
  it("detects the MCP JSON-RPC log fixture as 'mcp'", () => {
    expect(detectFormat(loadFixture("mcp-session.json"))).toBe("mcp");
  });

  it("detects the generic span array fixture as 'generic'", () => {
    expect(detectFormat(loadFixture("generic-spans.json"))).toBe("generic");
  });

  it("parseTrace dispatches to the right parser for each fixture", () => {
    const mcp = parseTrace(loadFixture("mcp-session.json"));
    expect(mcp.format).toBe("mcp");
    expect(mcp.spans.length).toBeGreaterThan(0);

    const generic = parseTrace(loadFixture("generic-spans.json"));
    expect(generic.format).toBe("generic");
    expect(generic.spans.length).toBeGreaterThan(0);
  });

  it("throws UnknownTraceFormatError for input that matches neither shape", () => {
    expect(() => detectFormat([{ foo: "bar" }])).toThrow(UnknownTraceFormatError);
    expect(() => detectFormat({ not: "an array" })).toThrow(UnknownTraceFormatError);
  });

  it("treats an empty array as an empty (valid) generic trace rather than an error", () => {
    expect(detectFormat([])).toBe("generic");
    expect(parseTrace([]).spans).toHaveLength(0);
  });
});
