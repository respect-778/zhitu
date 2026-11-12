/**
 * Pure trace-view helpers for `deepinterview traces`.
 *
 * Mirrors the event shapes written by
 * `apps/agent/src/deepinterview_agent/core/tracing.py` (one JSON object per
 * line: `trace_start` / `span_start` / `span_end` / `event` / `llm_call` /
 * `trace_end`). No I/O here except `listTraceFiles`' directory scan — all
 * parsing/formatting is pure so vitest can cover it without fixtures on disk.
 */

export interface TraceEvent {
  type: string;
  trace_id: string;
  ts?: string;
  name?: string;
  session_id?: string | null;
  span_id?: string | null;
  parent_id?: string | null;
  duration_ms?: number;
  status?: string;
  error?: string;
  attrs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  // llm_call extras
  provider?: string;
  model?: string;
  method?: string;
  schema?: string;
  prompt_chars?: number;
  latency_ms?: number;
  ok?: boolean;
}

export interface TraceSummary {
  trace_id: string;
  name: string;
  session_id: string | null;
  started_at: string;
  duration_ms: number | null;
  spans: number;
  llm_calls: number;
  errors: number;
  status: string;
}

export interface SpanNode {
  span_id: string;
  parent_id: string | null;
  name: string;
  started_at?: string;
  duration_ms: number | null;
  status: string;
  error?: string;
  attrs: Record<string, unknown>;
  events: TraceEvent[];
  llm_calls: TraceEvent[];
  children: SpanNode[];
}

/** TRACE_DIR env wins, then the repo default (same resolution as the agent). */
export function resolveTraceDir(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env.TRACE_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return ".deepinterview/traces";
}

export function parseTraceLines(text: string): TraceEvent[] {
  const out: TraceEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TraceEvent;
      if (parsed && typeof parsed.type === "string") out.push(parsed);
    } catch {
      // Skip malformed lines — a crashed run must not break the viewer.
    }
  }
  return out;
}

export function summarizeTrace(
  traceId: string,
  events: TraceEvent[],
): TraceSummary {
  let name = traceId;
  let session_id: string | null = null;
  let started_at = "";
  let duration_ms: number | null = null;
  let status = "running";
  let spans = 0;
  let llm_calls = 0;
  let errors = 0;
  for (const ev of events) {
    if (ev.type === "trace_start") {
      name = ev.name ?? name;
      session_id = ev.session_id ?? null;
      started_at = ev.ts ?? "";
    } else if (ev.type === "trace_end") {
      duration_ms = ev.duration_ms ?? null;
      status = ev.status ?? "ok";
      if (ev.error) errors += 1;
    } else if (ev.type === "span_start") {
      spans += 1;
    } else if (ev.type === "span_end" && ev.status === "error") {
      errors += 1;
    } else if (ev.type === "llm_call") {
      llm_calls += 1;
      if (ev.ok === false) errors += 1;
    }
  }
  return {
    trace_id: traceId,
    name,
    session_id,
    started_at,
    duration_ms,
    spans,
    llm_calls,
    errors,
    status,
  };
}

/** Nest flat span_start/span_end pairs into a tree, attaching events/calls. */
export function buildSpanTree(events: TraceEvent[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  const order: string[] = [];
  for (const ev of events) {
    if (ev.type === "span_start" && ev.span_id) {
      if (!byId.has(ev.span_id)) {
        byId.set(ev.span_id, {
          span_id: ev.span_id,
          parent_id: ev.parent_id ?? null,
          name: ev.name ?? ev.span_id,
          started_at: ev.ts,
          duration_ms: null,
          status: "running",
          attrs: ev.attrs ?? {},
          events: [],
          llm_calls: [],
          children: [],
        });
        order.push(ev.span_id);
      }
    } else if (ev.type === "span_end" && ev.span_id && byId.has(ev.span_id)) {
      const node = byId.get(ev.span_id)!;
      node.duration_ms = ev.duration_ms ?? null;
      node.status = ev.status ?? "ok";
      if (ev.error) node.error = ev.error;
    } else if (
      (ev.type === "event" || ev.type === "llm_call") &&
      ev.span_id &&
      byId.has(ev.span_id)
    ) {
      const node = byId.get(ev.span_id)!;
      if (ev.type === "llm_call") node.llm_calls.push(ev);
      else node.events.push(ev);
    }
  }
  const roots: SpanNode[] = [];
  for (const id of order) {
    const node = byId.get(id)!;
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.round(s % 60)}s`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function formatSummaryTable(summaries: TraceSummary[]): string {
  if (summaries.length === 0)
    return "No traces yet — run an interview or prep first.";
  const lines = [
    `  ${pad("TRACE", 16)} ${pad("NAME", 8)} ${pad("SESSION", 22)} ${pad("TIME", 7)} ${pad("SPANS", 6)} ${pad("LLM", 4)} ${pad("STATUS", 8)}`,
  ];
  for (const s of summaries) {
    const flag = s.errors > 0 ? "!" : " ";
    lines.push(
      `${flag} ${pad(s.trace_id, 16)} ${pad(s.name, 8)} ${pad(s.session_id ?? "—", 22)} ${pad(fmtDuration(s.duration_ms), 7)} ${pad(String(s.spans), 6)} ${pad(String(s.llm_calls), 4)} ${pad(s.status, 8)}`,
    );
  }
  return lines.join("\n");
}

function formatSpanNode(node: SpanNode, depth: number): string[] {
  const indent = "  ".repeat(depth + 1);
  const mark = node.status === "error" ? "✕" : "·";
  const head = `${indent}${mark} ${node.name} (${fmtDuration(node.duration_ms)})`;
  const lines = [
    node.error ? `${head}\n${indent}  error: ${node.error}` : head,
  ];
  for (const call of node.llm_calls) {
    const ok = call.ok === false ? "✕" : "✓";
    lines.push(
      `${indent}  ${ok} llm ${call.method ?? "?"} ${call.model ?? ""} ${call.schema ?? ""} ${fmtDuration(call.latency_ms)}`
        .replace(/ +/g, " ")
        .trimEnd(),
    );
    if (call.error) lines.push(`${indent}    error: ${call.error}`);
  }
  for (const ev of node.events) {
    const attrs =
      ev.attrs && Object.keys(ev.attrs).length > 0
        ? ` ${JSON.stringify(ev.attrs)}`
        : "";
    lines.push(`${indent}  ◦ ${ev.name}${attrs}`);
  }
  for (const child of node.children)
    lines.push(...formatSpanNode(child, depth + 1));
  return lines;
}

export function formatTraceDetail(
  summary: TraceSummary,
  events: TraceEvent[],
): string {
  const header = [
    `trace   ${summary.trace_id} (${summary.name})`,
    `session ${summary.session_id ?? "—"}`,
    `started ${summary.started_at || "—"} · duration ${fmtDuration(summary.duration_ms)} · status ${summary.status}`,
    `spans ${summary.spans} · llm calls ${summary.llm_calls} · errors ${summary.errors}`,
    "",
  ];
  const roots = buildSpanTree(events);
  if (roots.length === 0) header.push("  (no spans recorded)");
  else for (const root of roots) header.push(...formatSpanNode(root, 0));
  // Span-less top-level events (e.g. live turn markers outside any span).
  const orphan = events.filter((e) => e.type === "event" && !e.span_id);
  for (const ev of orphan) header.push(`  ◦ ${ev.name}`);
  return header.join("\n");
}
