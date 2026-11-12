/**
 * Pure linter for `skills/` pack files (Markdown + YAML frontmatter).
 *
 * Mirrors the Python source of truth (`apps/agent/.../skilllib/models.py`,
 * `SkillFrontmatter` with `extra="forbid"`) so contributors get the same
 * verdict locally that the agent's parser gives at runtime. Kept pure
 * (text in → issues out) so it's trivially testable; the `skills` command
 * does the file walking.
 */
import { parse } from "yaml";
import { SenioritySchema } from "@deepinterview/shared";

export interface LintIssue {
  level: "error" | "warning";
  message: string;
}

const KNOWN_FIELDS = new Set([
  "id",
  "company",
  "role",
  "level",
  "competency",
  "version",
  "source_runs",
  "confidence",
  "last_verified",
  "status",
]);
const STATUSES = ["draft", "review", "promoted", "deprecated"];
const RECOMMENDED_SECTIONS = [
  "Round structure",
  "Question bank",
  "Signals",
  "Pitfalls",
];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function lintSkillText(text: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  const stripped = text.replace(/^\n+/, "");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(stripped);
  if (!match) {
    err("file must start with a '---' YAML frontmatter block closed by '---'");
    return issues;
  }
  const front = match[1] ?? "";
  const body = match[2] ?? "";

  let data: unknown;
  try {
    data = parse(front);
  } catch (cause) {
    err(`frontmatter is not valid YAML: ${String(cause)}`);
    return issues;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    err("frontmatter must be a YAML mapping");
    return issues;
  }
  const fm = data as Record<string, unknown>;

  // extra="forbid" parity: the agent's parser rejects unknown fields.
  for (const key of Object.keys(fm)) {
    if (!KNOWN_FIELDS.has(key)) err(`unknown frontmatter field \`${key}\``);
  }

  const id = fm.id;
  if (typeof id !== "string" || !SLUG_RE.test(id)) {
    err(
      "`id` is required and must be a kebab-case slug (e.g. generic-backend-engineer-senior)",
    );
  }
  const company = fm.company;
  if (typeof company !== "string" || company.trim() === "") {
    err(
      "`company` is required (a company name, or `generic` for a fallback pack)",
    );
  }
  const role = fm.role;
  if (typeof role !== "string" || !SLUG_RE.test(role)) {
    err(
      "`role` is required and must be a kebab-case slug (e.g. `backend-engineer`) — " +
        "it is matched by token subset against live JD titles (see skills/SCHEMA.md)",
    );
  }
  const level = fm.level;
  const levelCheck = SenioritySchema.safeParse(level);
  if (!levelCheck.success) {
    err(`\`level\` must be one of: ${SenioritySchema.options.join(", ")}`);
  }
  if (fm.competency !== undefined) {
    const ok =
      Array.isArray(fm.competency) &&
      fm.competency.every((c) => typeof c === "string" && c.trim() !== "");
    if (!ok) err("`competency` must be a list of non-empty strings");
  }
  if (
    fm.version !== undefined &&
    (!Number.isInteger(fm.version) || (fm.version as number) < 1)
  ) {
    err("`version` must be an integer >= 1");
  }
  if (
    fm.source_runs !== undefined &&
    (!Number.isInteger(fm.source_runs) || (fm.source_runs as number) < 0)
  ) {
    err("`source_runs` must be an integer >= 0");
  }
  if (
    fm.confidence !== undefined &&
    (typeof fm.confidence !== "number" ||
      fm.confidence < 0 ||
      fm.confidence > 1)
  ) {
    err("`confidence` must be a number between 0 and 1");
  }
  const verified = fm.last_verified;
  const verifiedStr =
    verified instanceof Date ? verified.toISOString().slice(0, 10) : verified;
  if (typeof verifiedStr !== "string" || !DATE_RE.test(verifiedStr)) {
    err("`last_verified` is required and must be an ISO date (YYYY-MM-DD)");
  }
  if (fm.status !== undefined && !STATUSES.includes(fm.status as string)) {
    err(`\`status\` must be one of: ${STATUSES.join(", ")}`);
  }

  // Conventions (warnings — the agent still parses these files fine).
  if (
    typeof id === "string" &&
    typeof company === "string" &&
    typeof role === "string" &&
    typeof level === "string"
  ) {
    const canonical = slugify(`${company}-${role}-${level}`);
    if (id !== canonical) {
      warn(`\`id\` is usually \`{company}-{role}-{level}\` → \`${canonical}\``);
    }
  }
  for (const section of RECOMMENDED_SECTIONS) {
    const re = new RegExp(`^##\\s+${section}\\s*$`, "im");
    if (!re.test(body))
      warn(`body is missing the recommended \`## ${section}\` section`);
  }
  if (/^##\s+Question bank\s*$/im.test(body)) {
    const bank =
      body.split(/^##\s+Question bank\s*$/im)[1]?.split(/^##\s/m)[0] ?? "";
    if (!/^\s*-\s+\S/m.test(bank))
      warn("`## Question bank` section has no `- ` question items");
  }

  return issues;
}
