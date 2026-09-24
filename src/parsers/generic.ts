import type { Span, ParseResult, SpanStatus } from "../types.js";

/**
 * Generic span format - a fallback for anyone exporting spans from some
 * other system (a hand-rolled logger, an OpenTelemetry-ish export, etc.):
 *
 *   [
 *     {
 *       "id": "root-1",
 *       "name": "agent.run",
 *       "startTime": 1739500800000,
 *       "endTime": 1739500802350,
 *       "parentId": null,
 *       "status": "ok",
 *       "metadata": { "anything": "you want" }
 *     },
 *     ...
 *   ]
 *
 * startTime/endTime may be epoch milliseconds (number) or ISO-8601 strings.
 */

export interface GenericSpanInput {
  id: string | number;
  name: string;
  startTime: number | string;
  endTime: number | string;
  parentId?: string | number | null;
  status?: SpanStatus;
  metadata?: Record<string, unknown>;
}

export function looksLikeGenericSpan(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    (typeof entry.startTime === "number" || typeof entry.startTime === "string") &&
    (typeof entry.endTime === "number" || typeof entry.endTime === "string") &&
    entry.id !== undefined
  );
}

function toEpochMs(value: number | string, warnings: string[], context: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  warnings.push(`${context}: could not parse time value ${JSON.stringify(value)}. Treated as 0.`);
  return 0;
}

export function parseGenericSpans(raw: unknown): ParseResult {
  const warnings: string[] = [];
  const spans: Span[] = [];

  if (!Array.isArray(raw)) {
    warnings.push("Top-level generic trace input is not an array; no spans produced.");
    return { format: "generic", spans, warnings };
  }

  const seenIds = new Set<string>();

  raw.forEach((value, i) => {
    const context = `span #${i}`;
    if (!looksLikeGenericSpan(value)) {
      warnings.push(`${context}: missing required fields (id, name, startTime, endTime), skipped.`);
      return;
    }
    const input = value as GenericSpanInput;
    let id = String(input.id);
    if (seenIds.has(id)) {
      warnings.push(`${context}: duplicate id "${id}", renamed to keep it unique.`);
      id = `${id}-dup-${i}`;
    }
    seenIds.add(id);

    spans.push({
      id,
      name: input.name,
      startTime: toEpochMs(input.startTime, warnings, context),
      endTime: toEpochMs(input.endTime, warnings, context),
      parentId: input.parentId != null ? String(input.parentId) : null,
      status: input.status ?? "ok",
      metadata: input.metadata,
    });
  });

  spans.sort((a, b) => a.startTime - b.startTime);

  return { format: "generic", spans, warnings };
}
