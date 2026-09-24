/**
 * Core data model that both parsers (MCP JSON-RPC log, generic span array)
 * normalize into. Everything downstream (layout, rendering) only ever sees
 * `Span[]` - it has no idea which format the trace originally came from.
 */

export type SpanStatus = "ok" | "error" | "pending";

export interface Span {
  /** Unique within the trace. */
  id: string;
  /** Human-readable label, e.g. an MCP method name or a generic span name. */
  name: string;
  /** Milliseconds since epoch. */
  startTime: number;
  /** Milliseconds since epoch. Equal to startTime for zero-duration events. */
  endTime: number;
  /** id of the enclosing span, or null for a root span. */
  parentId: string | null;
  status: SpanStatus;
  /** Arbitrary extra data shown in the detail panel (request params, result, error, ...). */
  metadata?: Record<string, unknown>;
}

export type TraceFormat = "mcp" | "generic";

export interface ParseResult {
  format: TraceFormat;
  spans: Span[];
  /** Non-fatal issues found while parsing (unmatched ids, bad timestamps, ...). */
  warnings: string[];
}

export function duration(span: Span): number {
  return Math.max(0, span.endTime - span.startTime);
}
