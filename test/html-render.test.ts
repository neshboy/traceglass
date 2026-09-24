import { describe, expect, it } from "vitest";
import { renderTraceToHtml } from "../src/index.js";
import { loadFixture } from "./helpers.js";

const VOID_ELEMENTS = new Set(["meta", "link", "br", "img", "input", "hr", "!doctype"]);

/**
 * Per the HTML5 spec, <script> and <style> are "raw text" elements: their
 * contents are never parsed as markup, even if they contain characters that
 * look like tags (our client-side JS builds HTML via string concatenation,
 * so it's full of literal "<div>"-shaped substrings). Blank those bodies out
 * before checking tag balance, and before scanning for injected markup, so
 * we're checking the same thing a browser would.
 */
function stripRawTextElementBodies(html: string): string {
  return html
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, "$1$3")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, "$1$3");
}

/**
 * A deliberately simple, dependency-free well-formedness check: walk every
 * start/end tag with a stack and assert it balances out. Self-closing tags
 * (`<rect ... />`) and HTML void elements are exempt, same as any HTML5
 * parser would treat them.
 */
function assertBalancedTags(rawHtml: string): void {
  const html = stripRawTextElementBodies(rawHtml);
  const tagRe = /<\/?([a-zA-Z!][a-zA-Z0-9-]*)([^>]*)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    const [full, name, attrs] = match;
    const tagName = name.toLowerCase();
    const isClosing = full.startsWith("</");
    const isSelfClosing = attrs.trim().endsWith("/") || VOID_ELEMENTS.has(tagName);

    if (isClosing) {
      const top = stack.pop();
      if (top !== tagName) {
        throw new Error(`Mismatched closing tag </${tagName}> - expected </${top}>. Stack: ${stack.join(",")}`);
      }
    } else if (!isSelfClosing) {
      stack.push(tagName);
    }
  }
  if (stack.length !== 0) {
    throw new Error(`Unclosed tags remain: ${stack.join(", ")}`);
  }
}

describe("renderTraceToHtml", () => {
  it("produces well-formed HTML (balanced tags) for the MCP fixture", () => {
    const html = renderTraceToHtml(loadFixture("mcp-session.json"), { title: "MCP demo" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    assertBalancedTags(html);
  });

  it("produces well-formed HTML (balanced tags) for the generic fixture", () => {
    const html = renderTraceToHtml(loadFixture("generic-spans.json"), { title: "Generic demo" });
    assertBalancedTags(html);
  });

  it("contains the expected span names and computed durations", () => {
    const html = renderTraceToHtml(loadFixture("mcp-session.json"));
    expect(html).toContain("tools/call: fetch_data");
    expect(html).toContain("tools/call: run_pipeline");
    expect(html).toContain("tools/call: write_to_cache");
    // Real computed durations, not placeholders.
    expect(html).toContain("120ms"); // fetch_data
    expect(html).toContain("700ms"); // run_pipeline (root)
    expect(html).toContain("55ms"); // write_to_cache
  });

  it("embeds a valid, parseable JSON payload with every span for the client script to consume", () => {
    const html = renderTraceToHtml(loadFixture("mcp-session.json"));
    const match = html.match(/<script id="trace-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.format).toBe("mcp");
    expect(Array.isArray(parsed.spans)).toBe(true);
    expect(parsed.spans.length).toBe(8);
  });

  it("renders bars with real, distinct x/width attributes (not placeholder values)", () => {
    const html = renderTraceToHtml(loadFixture("generic-spans.json"));
    const rects = Array.from(html.matchAll(/<rect x="([\d.]+)" y="2" width="([\d.]+)"/g));
    expect(rects.length).toBe(6);
    // Not every bar should have the same x - otherwise layout is placeholder/fake.
    const xs = new Set(rects.map((r) => r[1]));
    expect(xs.size).toBeGreaterThan(1);
  });

  it("renders an empty-state message instead of crashing on an empty trace", () => {
    const html = renderTraceToHtml([]);
    expect(html).toContain("No spans to display");
    assertBalancedTags(html);
  });

  it("escapes span names so a hostile trace can't inject markup into the visible DOM", () => {
    const html = renderTraceToHtml([
      {
        id: "x",
        name: '<img src=x onerror=alert(1)>',
        startTime: 0,
        endTime: 10,
        parentId: null,
      },
    ]);
    // Outside of <script>/<style> (where raw text can never execute as HTML
    // per the HTML5 spec), the payload must never appear unescaped.
    const visibleMarkup = stripRawTextElementBodies(html);
    expect(visibleMarkup).not.toContain("<img src=x onerror=alert(1)>");
    expect(visibleMarkup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    assertBalancedTags(html);
  });
});
