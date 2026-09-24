import type { Span } from "../types.js";

/**
 * A span placed on the timeline: real computed offset/width (as percentages
 * of the total trace duration), real nesting depth, and real row position -
 * nothing here is a placeholder, it all comes from the spans' own
 * start/end times and parent/child links.
 */
export interface LayoutNode {
  span: Span;
  depth: number;
  rowIndex: number;
  children: LayoutNode[];
  /** 0-100, offset from the left edge of the timeline. */
  xPercent: number;
  /** 0-100, width of the bar. Floored to a minimum so zero-duration spans stay visible. */
  widthPercent: number;
}

export interface Layout {
  /** Flattened depth-first, so a parent is always immediately followed by its descendants. */
  nodes: LayoutNode[];
  traceStart: number;
  traceEnd: number;
  totalDuration: number;
  warnings: string[];
}

const MIN_WIDTH_PERCENT = 0.4;

export function computeLayout(spans: Span[]): Layout {
  const warnings: string[] = [];

  if (spans.length === 0) {
    return { nodes: [], traceStart: 0, traceEnd: 0, totalDuration: 0, warnings };
  }

  const byId = new Map(spans.map((s) => [s.id, s]));

  // Resolve each span's *effective* parent up front: unknown parentIds and
  // self-references become roots immediately, and any longer cycle
  // (a -> b -> a) is detected and cut at one edge so every span still ends
  // up reachable from a root instead of silently vanishing.
  const effectiveParent = new Map<string, string | null>();
  for (const span of spans) {
    let parentKey: string | null = span.parentId;
    if (parentKey !== null && !byId.has(parentKey)) {
      warnings.push(`Span "${span.id}" references unknown parentId "${parentKey}"; treated as a root span.`);
      parentKey = null;
    } else if (parentKey === span.id) {
      warnings.push(`Span "${span.id}" lists itself as its own parent; treated as a root span.`);
      parentKey = null;
    }
    effectiveParent.set(span.id, parentKey);
  }

  const color = new Map<string, "in-progress" | "done">();
  for (const span of spans) {
    if (color.get(span.id) === "done") continue;
    const path: string[] = [];
    let cur: string | null = span.id;
    while (cur !== null && color.get(cur) !== "done" && color.get(cur) !== "in-progress") {
      color.set(cur, "in-progress");
      path.push(cur);
      cur = effectiveParent.get(cur) ?? null;
    }
    if (cur !== null && color.get(cur) === "in-progress") {
      warnings.push(`Cycle detected in parent links involving span "${cur}"; breaking the cycle there.`);
      effectiveParent.set(cur, null);
    }
    for (const id of path) color.set(id, "done");
  }

  const childrenOf = new Map<string | null, Span[]>();
  for (const span of spans) {
    const parentKey = effectiveParent.get(span.id) ?? null;
    const bucket = childrenOf.get(parentKey) ?? [];
    bucket.push(span);
    childrenOf.set(parentKey, bucket);
  }

  const traceStart = Math.min(...spans.map((s) => s.startTime));
  const traceEnd = Math.max(...spans.map((s) => s.endTime));
  const totalDuration = Math.max(1, traceEnd - traceStart);

  const nodes: LayoutNode[] = [];
  let rowCounter = 0;
  const visiting = new Set<string>();

  function build(span: Span, depth: number): LayoutNode {
    const xPercent = ((span.startTime - traceStart) / totalDuration) * 100;
    const rawWidth = ((span.endTime - span.startTime) / totalDuration) * 100;
    const node: LayoutNode = {
      span,
      depth,
      rowIndex: rowCounter++,
      children: [],
      xPercent,
      widthPercent: Math.max(rawWidth, MIN_WIDTH_PERCENT),
    };
    nodes.push(node);

    visiting.add(span.id);
    const kids = (childrenOf.get(span.id) ?? []).slice().sort((a, b) => a.startTime - b.startTime);
    for (const kid of kids) {
      if (visiting.has(kid.id)) {
        warnings.push(`Cycle detected involving span "${kid.id}"; stopped descending.`);
        continue;
      }
      node.children.push(build(kid, depth + 1));
    }
    visiting.delete(span.id);
    return node;
  }

  const roots = (childrenOf.get(null) ?? []).slice().sort((a, b) => a.startTime - b.startTime);
  for (const root of roots) {
    build(root, 0);
  }

  return { nodes, traceStart, traceEnd, totalDuration, warnings };
}
