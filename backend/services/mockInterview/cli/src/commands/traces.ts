/**
 * `deepinterview traces` — easy tracking of agent work from the terminal.
 *
 * Reads the local JSONL trace store written by the agent
 * (`apps/agent/src/deepinterview_agent/core/tracing.py`, default
 * `.deepinterview/traces/<trace_id>.jsonl`; override with TRACE_DIR):
 *
 *   deepinterview traces [list] [--limit N] [--session ID] [--dir PATH] [--json]
 *   deepinterview traces show <trace-id> [--dir PATH] [--json]
 *   deepinterview traces tail [--limit N]      (alias for list, newest first)
 *   deepinterview traces open <trace-id>       (local path + Langfuse hint)
 *
 * Exit 1 on unknown trace / unreadable dir so the command is script-friendly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  formatSummaryTable,
  formatTraceDetail,
  parseTraceLines,
  resolveTraceDir,
  summarizeTrace,
  type TraceSummary,
} from "../lib/trace-view";

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

function flag(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg !== undefined && names.includes(arg)) return args[i + 1];
  }
  return undefined;
}

function hasFlag(args: string[], ...names: string[]): boolean {
  return args.some((a) => names.includes(a));
}

interface LoadedSummary extends TraceSummary {
  mtime: number;
}

function loadSummaries(dir: string): LoadedSummary[] {
  if (!existsSync(dir)) return [];
  const out: LoadedSummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("tr_") || !name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile()) continue;
      const events = parseTraceLines(readFileSync(path, "utf8"));
      if (events.length === 0) continue;
      out.push({
        ...summarizeTrace(basename(name, ".jsonl"), events),
        mtime: statSync(path).mtimeMs,
      });
    } catch {
      // A half-written file from a live run must not break the listing.
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

async function runList(args: string[], dir: string): Promise<void> {
  const limit = Math.max(1, Number(flag(args, "--limit", "-n") ?? "20") || 20);
  const session = flag(args, "--session", "-s");
  const asJson = hasFlag(args, "--json");
  let summaries = loadSummaries(dir);
  if (session) summaries = summaries.filter((s) => s.session_id === session);
  summaries = summaries.slice(0, limit);
  if (asJson) {
    console.log(
      JSON.stringify(
        summaries.map(({ mtime: _m, ...s }) => s),
        null,
        2,
      ),
    );
    return;
  }
  if (summaries.length === 0) {
    console.log("No traces yet — run an interview or prep first.");
    console.log(`(looking in ${dir}; override with --dir or TRACE_DIR)`);
    return;
  }
  console.log(formatSummaryTable(summaries));
  console.log(
    `\n${summaries.length} trace(s) — \`deepinterview traces show <trace-id>\` for detail.`,
  );
}

async function runShow(args: string[], dir: string): Promise<void> {
  const id = args[0];
  if (!id) {
    fail("Usage: deepinterview traces show <trace-id> [--dir PATH] [--json]");
    return;
  }
  if (id.includes("/") || id.startsWith(".")) {
    fail(`Unknown trace: ${id}`);
    return;
  }
  const path = join(dir, `${id}.jsonl`);
  if (!existsSync(path)) {
    fail(`Unknown trace: ${id} (not in ${dir})`);
    return;
  }
  const events = parseTraceLines(readFileSync(path, "utf8"));
  const summary = summarizeTrace(id, events);
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify({ ...summary, events }, null, 2));
    return;
  }
  console.log(formatTraceDetail(summary, events));
}

async function runOpen(args: string[], dir: string): Promise<void> {
  const id = args[0];
  if (!id) {
    fail("Usage: deepinterview traces open <trace-id>");
    return;
  }
  console.log(`Local:  ${join(dir, `${id}.jsonl`)}`);
  if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
    const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";
    console.log(
      `Cloud:  ${host} — search traces for "${id}" (same trace id is forwarded).`,
    );
  } else {
    console.log(
      "Cloud:  (not configured — set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY and",
    );
    console.log(
      "        `uv sync --extra observability` to also forward spans to Langfuse.)",
    );
  }
}

export async function runTraces(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const dir = resolveTraceDir(flag(args, "--dir"));
  switch (sub) {
    case undefined:
    case "list":
    case "tail":
      await runList(rest, dir);
      break;
    case "show":
      await runShow(rest, dir);
      break;
    case "open":
      await runOpen(rest, dir);
      break;
    default:
      // Bare trace id behaves like `show` for muscle memory.
      if (!sub.startsWith("-")) {
        await runShow(args, dir);
        break;
      }
      console.error(
        "Usage: deepinterview traces [list|show <id>|tail|open <id>] [--dir PATH] [--json]",
      );
      process.exitCode = 1;
  }
}
