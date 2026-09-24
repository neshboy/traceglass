import type { Layout, LayoutNode } from "./layout.js";
import type { ParseResult } from "../types.js";
import { duration } from "../types.js";
import { escapeHtml, escapeForInlineScript, formatDuration, formatTimestamp } from "./format.js";
import { CLIENT_SCRIPT } from "./client-script.js";

const ROW_INDENT_PX = 18;

/**
 * Renders one row's SVG bar. `x`/`width` are real coordinates computed from
 * the span's own start/end times (see layout.ts), mapped onto a 0-1000
 * viewBox so the numbers in the markup are exact tenths of a percent - not
 * placeholders.
 */
function renderBarSvg(node: LayoutNode): string {
  const x = (node.xPercent * 10).toFixed(1);
  const width = (node.widthPercent * 10).toFixed(1);
  return (
    `<svg class="bar-svg" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect x="${x}" y="2" width="${width}" height="16" rx="3" class="bar bar-${node.span.status}"></rect>` +
    `</svg>`
  );
}

function renderRow(node: LayoutNode): string {
  const span = node.span;
  const hasChildren = node.children.length > 0;
  const toggle = hasChildren
    ? `<button class="toggle" type="button" aria-label="Collapse/expand">▾</button>`
    : `<span class="toggle-spacer"></span>`;
  const durationLabel = formatDuration(duration(span));
  const tooltip = `${span.name} — ${durationLabel} (${span.status})`;

  return (
    `<div class="row" data-id="${escapeHtml(span.id)}" data-parent="${span.parentId ? escapeHtml(span.parentId) : ""}" data-depth="${node.depth}" title="${escapeHtml(tooltip)}">` +
    `<div class="row-label" style="padding-left: ${node.depth * ROW_INDENT_PX}px">` +
    toggle +
    `<span class="name">${escapeHtml(span.name)}</span>` +
    `<span class="badge badge-${span.status}">${escapeHtml(span.status)}</span>` +
    `</div>` +
    `<div class="row-track">` +
    `<div class="row-bar" style="left: ${node.xPercent.toFixed(2)}%; width: ${node.widthPercent.toFixed(2)}%">` +
    renderBarSvg(node) +
    `</div>` +
    `</div>` +
    `<div class="row-duration">${durationLabel}</div>` +
    `</div>`
  );
}

function renderRuler(layout: Layout): string {
  const ticks = 5;
  const marks: string[] = [];
  for (let i = 0; i <= ticks; i++) {
    const pct = (i / ticks) * 100;
    const ms = (layout.totalDuration * i) / ticks;
    marks.push(
      `<div class="ruler-tick" style="left: ${pct.toFixed(2)}%">` +
        `<span>${formatDuration(ms)}</span>` +
        `</div>`
    );
  }
  return `<div class="ruler">${marks.join("")}</div>`;
}

function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) return "";
  const items = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  return (
    `<details class="warnings"><summary>${warnings.length} parser warning(s)</summary>` +
    `<ul>${items}</ul></details>`
  );
}

const CSS = `
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --panel: #161923;
  --border: #262b3a;
  --text: #e4e7ee;
  --muted: #8b93a7;
  --accent: #5b8cff;
  --ok: #4caf7d;
  --error: #e5534b;
  --pending: #d9a441;
  --row-h: 30px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}
header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
header h1 { font-size: 16px; margin: 0; }
header .stat { color: var(--muted); }
main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  height: calc(100vh - 58px);
}
.timeline {
  overflow: auto;
  border-right: 1px solid var(--border);
}
.toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--panel);
  z-index: 2;
}
.toolbar button {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
.toolbar button:hover { border-color: var(--accent); }
.ruler {
  position: sticky;
  top: 37px;
  height: 22px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  margin-left: 260px;
  margin-right: 70px;
  position: relative;
  z-index: 1;
}
.ruler-tick {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid var(--border);
  padding-left: 4px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.rows { position: relative; }
.row {
  display: grid;
  grid-template-columns: 260px 1fr 70px;
  align-items: center;
  height: var(--row-h);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.row:hover { background: rgba(91, 140, 255, 0.08); }
.row.selected { background: rgba(91, 140, 255, 0.18); }
.row.hidden { display: none; }
.row-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 8px;
}
.row-label .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toggle {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  width: 16px;
  flex: none;
  font-size: 11px;
  padding: 0;
}
.toggle-spacer { width: 16px; flex: none; display: inline-block; }
.badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border);
  color: var(--muted);
  flex: none;
}
.badge-error { color: var(--error); border-color: var(--error); }
.badge-pending { color: var(--pending); border-color: var(--pending); }
.row-track {
  position: relative;
  height: 100%;
}
.row-bar {
  position: absolute;
  top: 6px;
  height: 18px;
  min-width: 4px;
}
.bar-svg { width: 100%; height: 100%; display: block; }
.bar-ok { fill: var(--accent); }
.bar-error { fill: var(--error); }
.bar-pending { fill: var(--pending); opacity: 0.7; }
.row-duration {
  text-align: right;
  padding-right: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.detail-panel {
  padding: 16px;
  overflow: auto;
}
.detail-panel h2 { margin-top: 0; font-size: 14px; word-break: break-all; }
.detail-panel h3 { font-size: 12px; color: var(--muted); text-transform: uppercase; margin-top: 20px; }
.detail-fields { display: grid; grid-template-columns: 80px 1fr; gap: 4px 8px; font-size: 12px; }
.detail-fields dt { color: var(--muted); }
.detail-fields dd { margin: 0; word-break: break-all; }
.status-error { color: var(--error); }
.status-pending { color: var(--pending); }
.status-ok { color: var(--ok); }
.detail-panel pre {
  background: #0b0d12;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.warnings {
  margin: 8px 20px;
  color: var(--pending);
  font-size: 12px;
}
.warnings ul { margin: 6px 0 0 18px; }
.empty-state { padding: 40px; color: var(--muted); text-align: center; }
`;

export interface RenderOptions {
  title?: string;
  sourceFile?: string;
}

export function renderHTML(parsed: ParseResult, layout: Layout, options: RenderOptions = {}): string {
  const title = options.title ?? "TraceGlass";
  const rowsHtml = layout.nodes.map(renderRow).join("\n");
  const totalSpans = layout.nodes.length;
  const errorCount = layout.nodes.filter((n) => n.span.status === "error").length;
  const pendingCount = layout.nodes.filter((n) => n.span.status === "pending").length;
  const allWarnings = [...parsed.warnings, ...layout.warnings];

  const traceData = {
    format: parsed.format,
    spans: layout.nodes.map((n) => n.span),
  };
  const traceDataJson = escapeForInlineScript(JSON.stringify(traceData));

  const body =
    totalSpans === 0
      ? `<div class="empty-state">No spans to display.</div>`
      : `<div class="rows">${rowsHtml}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<span class="stat">format: ${escapeHtml(parsed.format)}</span>
<span class="stat">${totalSpans} span(s)</span>
<span class="stat">${formatDuration(layout.totalDuration)} total</span>
<span class="stat">start: ${formatTimestamp(layout.traceStart)}</span>
${errorCount > 0 ? `<span class="stat status-error">${errorCount} error(s)</span>` : ""}
${pendingCount > 0 ? `<span class="stat status-pending">${pendingCount} pending</span>` : ""}
</header>
${renderWarnings(allWarnings)}
<main>
<section class="timeline">
<div class="toolbar">
<button id="expand-all" type="button">Expand all</button>
<button id="collapse-all" type="button">Collapse all</button>
</div>
${renderRuler(layout)}
${body}
</section>
<aside class="detail-panel" id="detail-panel">
<div class="empty-state">Click a span to see its details.</div>
</aside>
</main>
<script id="trace-data" type="application/json">${traceDataJson}</script>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>
`;
}
