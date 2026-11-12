import { describe, expect, it } from "vitest";
import {
  buildSpanTree,
  formatSummaryTable,
  formatTraceDetail,
  parseTraceLines,
  summarizeTrace,
} from "./trace-view";

const SAMPLE = [
  `{"type": "trace_start", "trace_id": "tr_abc", "name": "prep", "session_id": "sess_1", "ts": "2026-01-01T00:00:00+00:00", "metadata": {}}`,
  `{"type": "span_start", "trace_id": "tr_abc", "span_id": "sp_1", "parent_id": null, "name": "prep.cv_analysis", "ts": "2026-01-01T00:00:01+00:00", "attrs": {}}`,
  `{"type": "llm_call", "trace_id": "tr_abc", "span_id": "sp_1", "ts": "2026-01-01T00:00:02+00:00", "provider": "mock", "model": "", "method": "complete_json", "schema": "CandidateProfile", "prompt_chars": 120, "latency_ms": 1.2, "ok": true}`,
  `{"type": "span_end", "trace_id": "tr_abc", "span_id": "sp_1", "name": "prep.cv_analysis", "ts": "2026-01-01T00:00:02+00:00", "duration_ms": 5.0, "status": "ok"}`,
  `{"type": "span_start", "trace_id": "tr_abc", "span_id": "sp_2", "parent_id": null, "name": "prep.question_planner", "ts": "2026-01-01T00:00:03+00:00", "attrs": {}}`,
  `{"type": "span_end", "trace_id": "tr_abc", "span_id": "sp_2", "name": "prep.question_planner", "ts": "2026-01-01T00:00:04+00:00", "duration_ms": 10.0, "status": "error", "error": "ValueError: bad json"}`,
  `{"type": "trace_end", "trace_id": "tr_abc", "name": "prep", "session_id": "sess_1", "ts": "2026-01-01T00:00:05+00:00", "duration_ms": 5000.0, "status": "ok"}`,
  "not json at all",
].join("\n");

describe("trace-view", () => {
  it("parses lines and skips malformed ones", () => {
    expect(parseTraceLines(SAMPLE)).toHaveLength(7);
    expect(parseTraceLines("")).toEqual([]);
  });

  it("summarizes counts, errors and timing", () => {
    const s = summarizeTrace("tr_abc", parseTraceLines(SAMPLE));
    expect(s.name).toBe("prep");
    expect(s.session_id).toBe("sess_1");
    expect(s.spans).toBe(2);
    expect(s.llm_calls).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.duration_ms).toBe(5000);
    expect(s.status).toBe("ok");
  });

  it("builds a flat span list with attached llm calls", () => {
    const roots = buildSpanTree(parseTraceLines(SAMPLE));
    expect(roots).toHaveLength(2);
    const [first, second] = roots;
    expect(first?.llm_calls).toHaveLength(1);
    expect(second?.status).toBe("error");
  });

  it("renders table and detail without throwing", () => {
    const events = parseTraceLines(SAMPLE);
    const summary = summarizeTrace("tr_abc", events);
    const table = formatSummaryTable([summary]);
    expect(table).toContain("tr_abc");
    expect(table).toContain("prep");
    const detail = formatTraceDetail(summary, events);
    expect(detail).toContain("prep.cv_analysis");
    expect(detail).toContain("CandidateProfile");
    expect(detail).toContain("bad json");
    expect(formatSummaryTable([])).toContain("No traces yet");
  });
});
