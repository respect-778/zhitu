import { describe, expect, it } from "vitest";
import { lintSkillText } from "./skill-lint";

const VALID = `---
id: generic-backend-engineer-senior
company: generic
role: backend-engineer
level: senior
competency:
  - system-design
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-07-25
status: promoted
---

# Generic — Senior Backend Engineer

## Round structure
1. Deep dive

## Question bank
- "Walk me through a system you scaled."

## Signals
- Quantifies impact.

## Pitfalls
- Designs for imaginary scale.
`;

function errors(text: string): string[] {
  return lintSkillText(text)
    .filter((i) => i.level === "error")
    .map((i) => i.message);
}

describe("lintSkillText", () => {
  it("passes a valid pack with no errors or warnings", () => {
    expect(lintSkillText(VALID)).toEqual([]);
  });

  it("rejects missing fences and invalid YAML", () => {
    expect(errors("# not a pack")).toHaveLength(1);
    expect(errors("---\n[broken\n---\nbody")).toHaveLength(1);
  });

  it("rejects unknown fields (extra=forbid parity with the agent parser)", () => {
    const text = VALID.replace(
      "status: promoted",
      "status: promoted\nauthor: me",
    );
    expect(errors(text)).toEqual(["unknown frontmatter field `author`"]);
  });

  it("rejects a non-slug role and a bad level", () => {
    const text = VALID.replace(
      "role: backend-engineer",
      "role: Senior Backend Engineer",
    ).replace("level: senior", "level: expert");
    const msgs = errors(text);
    expect(msgs.some((m) => m.includes("kebab-case slug"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("`level`"))).toBe(true);
  });

  it("rejects out-of-range confidence and bad dates", () => {
    const text = VALID.replace("confidence: 0.5", "confidence: 1.5").replace(
      "last_verified: 2026-07-25",
      "last_verified: July 2026",
    );
    expect(errors(text)).toHaveLength(2);
  });

  it("warns on non-canonical id and missing sections without erroring", () => {
    const text = VALID.replace(
      "id: generic-backend-engineer-senior",
      "id: my-cool-pack",
    ).replace(/## Signals[\s\S]*?(?=## Pitfalls)/, "");
    const issues = lintSkillText(text);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(
      issues.some((i) => i.message.includes("generic-backend-engineer-senior")),
    ).toBe(true);
    expect(issues.some((i) => i.message.includes("`## Signals`"))).toBe(true);
  });

  it("warns when the question bank has no items", () => {
    const text = VALID.replace('- "Walk me through a system you scaled."', "");
    const issues = lintSkillText(text);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(
      issues.some((i) => i.message.includes("no `- ` question items")),
    ).toBe(true);
  });
});
