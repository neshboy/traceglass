import type { ParseResult, TraceFormat } from "../types.js";
import { looksLikeMCPEntry, parseMCPLog } from "./mcp.js";
import { looksLikeGenericSpan, parseGenericSpans } from "./generic.js";

export class UnknownTraceFormatError extends Error {
  constructor() {
    super(
      'Could not detect trace format. Expected either an MCP JSON-RPC log ' +
        '(entries with a "jsonrpc" field) or a generic span array ' +
        '(entries with "id", "name", "startTime", "endTime").'
    );
    this.name = "UnknownTraceFormatError";
  }
}

/**
 * Inspect the parsed JSON and decide whether it's an MCP JSON-RPC session
 * log or a generic span array. Looks at the first several entries so a
 * single malformed row doesn't derail detection.
 */
export function detectFormat(raw: unknown): TraceFormat {
  if (!Array.isArray(raw)) {
    throw new UnknownTraceFormatError();
  }
  // An empty trace is valid (there's just nothing to render) - there's no
  // signal to detect a format from, so default to "generic" rather than
  // treating "no spans yet" as an error.
  if (raw.length === 0) {
    return "generic";
  }

  const sample = raw.slice(0, 10);
  const mcpVotes = sample.filter(looksLikeMCPEntry).length;
  const genericVotes = sample.filter(looksLikeGenericSpan).length;

  if (mcpVotes === 0 && genericVotes === 0) {
    throw new UnknownTraceFormatError();
  }
  return mcpVotes >= genericVotes ? "mcp" : "generic";
}

export function parseTrace(raw: unknown): ParseResult {
  const format = detectFormat(raw);
  return format === "mcp" ? parseMCPLog(raw) : parseGenericSpans(raw);
}
