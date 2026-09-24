# TraceGlass

TraceGlass is a zero-backend, local-only viewer for AI-agent execution traces. Point it at a JSON trace file - an MCP JSON-RPC session log, or a generic array of spans - and it renders an interactive, browser-network-tab-style waterfall: who called what, in what order, how long each call took, and how tool calls nest inside each other. The output is a single static HTML file. No server, no upload, no telemetry, no dependency at view time.

## Why

Agent frameworks and MCP servers produce a lot of JSON-RPC chatter. Reading it as raw JSON to understand "why did this take 4 seconds" or "which tool call actually failed" is painful. TraceGlass turns that log into a waterfall you can click through, the same way you'd read a browser's Network tab.

## Install / quick start

```bash
git clone <this repo>
cd traceglass
npm install
npm run build
node dist/cli.js render test/fixtures/mcp-session.json -o waterfall.html
```

Then open `waterfall.html` in any browser - directly from disk, no server required.

Once published, the intended usage is:

```bash
npm install -g traceglass
traceglass render trace.json -o waterfall.html
```

CLI usage:

```
traceglass render <input.json> [-o output.html] [-t "Custom title"]
```

The input format (MCP JSON-RPC log vs. generic span array) is auto-detected - you don't have to tell it which one you're feeding it.

## Supported trace formats

### 1. MCP JSON-RPC session log

A JSON array of JSON-RPC 2.0 messages as used by the [Model Context Protocol](https://modelcontextprotocol.io/), each one annotated with a `timestamp` (raw JSON-RPC has no timestamp field, so a recording layer has to add one) and an optional `parentId` if you want to represent nested tool calls (an agent's top-level tool call triggering sub-calls):

```json
[
  {
    "timestamp": "2026-02-14T10:00:00.000Z",
    "parentId": null,
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": { "name": "run_pipeline", "arguments": { "jobId": "job-42" } }
  },
  {
    "timestamp": "2026-02-14T10:00:00.010Z",
    "parentId": 1,
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": { "name": "fetch_data", "arguments": { "source": "s3://bucket/input.csv" } }
  },
  {
    "timestamp": "2026-02-14T10:00:00.130Z",
    "jsonrpc": "2.0",
    "id": 2,
    "result": { "content": [{ "type": "text", "text": "1024 rows fetched" }] }
  }
]
```

TraceGlass correlates each response back to its request **by `id`** (a FIFO queue per id, so reused ids within one session still match up in order) and computes each span's duration as `response.timestamp - request.timestamp`. Requests without a `method`/`id` at all are notifications and render as zero-duration markers; requests that never get a matching response render as `pending` spans (and a warning is recorded, visible in the generated page).

See [`test/fixtures/mcp-session.json`](test/fixtures/mcp-session.json) for a full example: an agent's `run_pipeline` tool call that fans out into `fetch_data`, `transform_data`, and `store_result` (which itself calls `write_to_cache`), plus a `validate_schema` call that returns a JSON-RPC error, a progress notification, and one call that never gets a response.

### 2. Generic span array (fallback)

For anything else - a hand-rolled logger, an OpenTelemetry-ish export, whatever - export a flat array of spans:

```json
[
  {
    "id": "span-1",
    "name": "agent.turn",
    "startTime": 1739500800000,
    "endTime": 1739500802350,
    "parentId": null,
    "status": "ok",
    "metadata": { "input": "Summarize last week's deploys" }
  },
  {
    "id": "span-2",
    "name": "llm.call",
    "startTime": "2025-02-14T02:40:00.050Z",
    "endTime": "2025-02-14T02:40:01.200Z",
    "parentId": "span-1",
    "metadata": { "model": "claude", "promptTokens": 812 }
  }
]
```

`startTime`/`endTime` accept either epoch milliseconds or ISO-8601 strings. `parentId` builds the nesting; omit it (or use `null`) for a root span. `status` defaults to `"ok"` (also accepts `"error"` / `"pending"`). See [`test/fixtures/generic-spans.json`](test/fixtures/generic-spans.json).

## What the rendered output looks like

Rendering `test/fixtures/mcp-session.json` produces a page with:

- A header showing the total trace duration (700ms), span count, and any error/pending counts.
- A left-hand tree of rows, indented by nesting depth: `run_pipeline` at the top, with `fetch_data`, `transform_data`, `store_result`, `validate_schema`, the progress notification, and `slow_operation` nested under it, and `write_to_cache` nested one level further under `store_result`.
- Each row has a bar in the timeline column, positioned and sized by real computed `x`/`width` values (percentages of the trace's total duration, derived straight from each span's own start/end timestamps - not placeholders). Error spans render in red, pending spans in amber.
- A duration column on the right (`120ms`, `700ms`, `55ms`, ...).
- Clicking a row opens a detail panel with its full id, status, start/end timestamps, and the raw request params / result / error payload as formatted JSON.
- Hovering a row shows a native tooltip with its name, duration, and status.
- Rows with children show a collapse/expand triangle; collapsing a row hides its whole subtree. "Expand all" / "Collapse all" buttons act on the whole tree.

The whole thing - markup, CSS, and interaction logic - is inlined into one `.html` file with no external requests.

## How it works

1. **Parse** (`src/parsers/`): `mcp.ts` correlates JSON-RPC requests/responses by id into `Span`s; `generic.ts` normalizes the flat span format; `detect.ts` sniffs which one you gave it.
2. **Layout** (`src/render/layout.ts`): builds the parent/child tree from `parentId`, flattens it depth-first (so a parent row is always immediately followed by its descendants, like a call stack), and computes each span's `xPercent`/`widthPercent` from its start/end time relative to the trace's total duration. Cycles and dangling `parentId`s are detected and defused (with a warning) instead of crashing or infinite-looping.
3. **Render** (`src/render/html.ts`): hand-generates the HTML string - rows, inline SVG bars (`<rect>` positioned with the real computed coordinates on a 0-1000 viewBox), the time ruler, the detail panel - plus a small vanilla-JS client script (`src/render/client-script.ts`) that's inlined as-is (no bundler, no framework) to drive click/collapse/hover behavor in the browser.

## Limitations (honest)

- **Two formats only.** MCP JSON-RPC session logs (in TraceGlass's specific timestamped/annotated shape) and the generic span array. Raw OpenTelemetry OTLP JSON, Jaeger/Zipkin exports, LangSmith/LangFuse exports, etc. are not supported directly - you'd need to convert them to the generic span format first.
- **MCP id correlation is FIFO per id, not per-connection-aware.** If the same numeric id is reused concurrently in a way that responses don't come back in the same order requests were sent, correlation can pick the wrong pending request. This is a reasonable simplification for typical single-session logs, not a guarantee for arbitrarily adversarial interleavings.
- **`parentId` for MCP logs is metadata you (or your recording proxy) have to add.** Raw JSON-RPC has no concept of "this call happened inside that call" - TraceGlass reads a `parentId` field if your logger writes one, but it can't infer nesting from the protocol alone.
- **No live/streaming mode.** TraceGlass renders a complete trace file; it doesn't tail a running session.
- **No search/filter UI yet.** For very large traces (thousands of spans) there's currently no way to filter the row list other than collapsing subtrees.
- **Minimum bar width.** Spans shorter than about 0.4% of the total trace duration are drawn at a floor width so they stay clickable; this means extremely short spans in a very long trace are not pixel-accurate widths (their position still is).
- **Single-file output only.** There's no multi-trace comparison view.

## Development

```bash
npm install
npm run build   # compile TypeScript -> dist/
npm test        # run the vitest suite
npm run dev -- render test/fixtures/mcp-session.json -o /tmp/out.html   # run the CLI from source via tsx
```

## License

MIT, see [LICENSE](LICENSE).
