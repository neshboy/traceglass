export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe to inline inside a <script type="application/json"> block. */
export function escapeForInlineScript(json: string): string {
  return json.replace(/<\/script/gi, "<\\/script");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}
