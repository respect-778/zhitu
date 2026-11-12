/**
 * `deepinterview skills lint [paths…]` — validate skill packs before a PR.
 *
 * With no paths, lints every pack in `skills/` and `skills/_review/` (files
 * whose content opens with a `---` frontmatter fence; README/SCHEMA are
 * skipped). Errors exit 1 so the command is CI-friendly; warnings don't.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { lintSkillText, type LintIssue } from "../lib/skill-lint";

function isPackFile(path: string): boolean {
  if (!path.endsWith(".md")) return false;
  try {
    return readFileSync(path, "utf8").trimStart().startsWith("---");
  } catch {
    return false;
  }
}

function defaultTargets(): string[] {
  const targets: string[] = [];
  for (const dir of ["skills", join("skills", "_review")]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isFile() && isPackFile(path)) targets.push(path);
    }
  }
  return targets;
}

function report(path: string, issues: LintIssue[]): void {
  if (issues.length === 0) {
    console.log(`  ok       ${path}`);
    return;
  }
  const worst = issues.some((i) => i.level === "error") ? "error" : "warning";
  console.log(`  ${worst.padEnd(8)} ${path}`);
  for (const issue of issues) {
    console.log(`           ${issue.level}: ${issue.message}`);
  }
}

export async function runSkills(args: string[]): Promise<void> {
  const [sub, ...paths] = args;
  if (sub !== "lint") {
    console.error("Usage: deepinterview skills lint [paths…]");
    process.exitCode = 1;
    return;
  }
  const targets = paths.length > 0 ? paths : defaultTargets();
  if (targets.length === 0) {
    console.error(
      "No skill packs found (run from the repo root, or pass file paths).",
    );
    process.exitCode = 1;
    return;
  }

  let errors = 0;
  let warnings = 0;
  for (const path of targets) {
    let issues: LintIssue[];
    try {
      issues = lintSkillText(readFileSync(path, "utf8"));
    } catch (cause) {
      issues = [
        { level: "error", message: `cannot read file: ${String(cause)}` },
      ];
    }
    errors += issues.filter((i) => i.level === "error").length;
    warnings += issues.filter((i) => i.level === "warning").length;
    report(path, issues);
  }

  console.log(
    `\n${targets.length} pack(s) checked — ${errors} error(s), ${warnings} warning(s).`,
  );
  if (errors > 0) process.exitCode = 1;
}
