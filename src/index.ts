import { parseTrace, detectFormat } from "./parsers/detect.js";
import { parseMCPLog } from "./parsers/mcp.js";
import { parseGenericSpans } from "./parsers/generic.js";
import { computeLayout } from "./render/layout.js";
import { renderHTML } from "./render/html.js";
import type { RenderOptions } from "./render/html.js";

export { parseTrace, detectFormat, parseMCPLog, parseGenericSpans, computeLayout, renderHTML };
export type { RenderOptions };
export * from "./types.js";
export type { Layout, LayoutNode } from "./render/layout.js";

/** End-to-end: raw parsed JSON -> standalone HTML string. */
export function renderTraceToHtml(raw: unknown, options: RenderOptions = {}): string {
  const parsed = parseTrace(raw);
  const layout = computeLayout(parsed.spans);
  return renderHTML(parsed, layout, options);
}
