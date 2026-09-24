import type { Span, ParseResult } from "../types.js";

/**
 * TraceGlass's MCP session log format.
 *
 * Raw JSON-RPC 2.0 messages (as used by the Model Context Protocol) carry no
 * timestamp and no notion of "which call this happened inside of", so a
 * recording proxy/logger has to add that bookkeeping. TraceGlass expects one
 * JSON array of entries shaped like this:
 *
 *   {
 *     "timestamp": "2026-02-14T10:00:00.000Z",  // ISO-8601 or epoch ms
 *     "parentId": null,                          // id of the enclosing call, if any
 *     "jsonrpc": "2.0",
 *     "id": 1,                                   // present on requests + responses
 *     "method": "tools/call",                    // present on requests/notifications
 *     "params": { ... }
 *   }
 *
 * and, for the matching response:
 *
 *   {
 *     "timestamp": "2026-02-14T10:00:00.320Z",
 *     "jsonrpc": "2.0",
 *     "id": 1,
 *     "result": { ... }        // or "error": { "code": ..., "message": ... }
 *   }
 *
 * Requests and responses are correlated by "id". Duration = the response's
 * timestamp minus the request's timestamp.
 */

export interface MCPLogEntry {
  timestamp: string | number;
  parentId?: string | number | null;
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function toEpochMs(timestamp: string | number, warnings: string[], context: string): number {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  warnings.push(`Could not parse timestamp for ${context}: ${JSON.stringify(timestamp)}. Treated as 0.`);
  return 0;
}

function isRequestLike(entry: MCPLogEntry): boolean {
  return typeof entry.method === "string" && entry.id !== undefined;
}

function isNotification(entry: MCPLogEntry): boolean {
  return typeof entry.method === "string" && entry.id === undefined;
}

function isResponseLike(entry: MCPLogEntry): boolean {
  return entry.id !== undefined && typeof entry.method !== "string" && ("result" in entry || "error" in entry);
}

/** Looks like a (possibly bare) JSON-RPC / MCP log entry, for format auto-detection. */
export function looksLikeMCPEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.jsonrpc !== "string") return false;
  return "method" in entry || "result" in entry || "error" in entry;
}

interface PendingRequest {
  entry: MCPLogEntry;
  startTime: number;
}

/**
 * "tools/call" is the same JSON-RPC method for every tool invocation, so
 * using it verbatim as a span name would make every row in the waterfall
 * say "tools/call". Fold in the actual tool name from params when present,
 * e.g. "tools/call: search_docs", so the tree reads like a real call stack.
 */
function deriveSpanName(method: string, params: unknown): string {
  if (typeof params === "object" && params !== null) {
    const name = (params as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) {
      return `${method}: ${name}`;
    }
  }
  return method;
}

export function parseMCPLog(raw: unknown): ParseResult {
  const warnings: string[] = [];
  const spans: Span[] = [];

  if (!Array.isArray(raw)) {
    warnings.push("Top-level MCP trace input is not an array; no spans produced.");
    return { format: "mcp", spans, warnings };
  }

  const entries = raw as MCPLogEntry[];
  // FIFO queue per json-rpc id, since ids may be reused across independent
  // calls within one session.
  const pending = new Map<string, PendingRequest[]>();
  let notificationCounter = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const context = `entry #${i}`;

    if (entry.jsonrpc !== "2.0") {
      warnings.push(`${context}: missing or unexpected "jsonrpc" field, skipped.`);
      continue;
    }

    if (isRequestLike(entry)) {
      const key = String(entry.id);
      const startTime = toEpochMs(entry.timestamp, warnings, context);
      const queue = pending.get(key) ?? [];
      queue.push({ entry, startTime });
      pending.set(key, queue);
      continue;
    }

    if (isNotification(entry)) {
      const t = toEpochMs(entry.timestamp, warnings, context);
      spans.push({
        id: `notif-${notificationCounter++}`,
        name: deriveSpanName(String(entry.method), entry.params),
        startTime: t,
        endTime: t,
        parentId: entry.parentId != null ? String(entry.parentId) : null,
        status: "ok",
        metadata: { kind: "notification", params: entry.params },
      });
      continue;
    }

    if (isResponseLike(entry)) {
      const key = String(entry.id);
      const queue = pending.get(key);
      const match = queue?.shift();
      if (!match) {
        warnings.push(`${context}: response with id=${entry.id} has no matching request, skipped.`);
        continue;
      }
      const endTime = toEpochMs(entry.timestamp, warnings, context);
      const hasError = entry.error !== undefined;
      spans.push({
        id: key,
        name: deriveSpanName(String(match.entry.method), match.entry.params),
        startTime: match.startTime,
        endTime,
        parentId: match.entry.parentId != null ? String(match.entry.parentId) : null,
        status: hasError ? "error" : "ok",
        metadata: {
          kind: "request/response",
          params: match.entry.params,
          result: entry.result,
          error: entry.error,
        },
      });
      continue;
    }

    warnings.push(`${context}: entry is neither a request, response, nor notification, skipped.`);
  }

  // Anything left in the queues never got a response.
  for (const [key, queue] of pending) {
    for (const leftover of queue) {
      warnings.push(`Request id=${key} (${leftover.entry.method}) never received a response; rendered as pending.`);
      spans.push({
        id: `${key}-pending-${leftover.startTime}`,
        name: deriveSpanName(String(leftover.entry.method), leftover.entry.params),
        startTime: leftover.startTime,
        endTime: leftover.startTime,
        parentId: leftover.entry.parentId != null ? String(leftover.entry.parentId) : null,
        status: "pending",
        metadata: { kind: "request (no response)", params: leftover.entry.params },
      });
    }
  }

  spans.sort((a, b) => a.startTime - b.startTime);

  return { format: "mcp", spans, warnings };
}
