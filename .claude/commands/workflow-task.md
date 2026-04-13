Create a new structured task for the given work.

Run:
```bash
npx agent-workflow quick "$ARGUMENTS" --root .
```

After creation, edit the generated task.md:
- Fill Goal with a one-paragraph user outcome
- Fill Scope with repo-relative paths (use `repo path: src/auth/` format)
  - In scope: files and directories this task will touch
  - Out of scope: what should not be changed
- Fill Deliverables and Risks

Then read context.md and verification.md:
- context.md: fill Why now, Facts, Open questions
- verification.md: fill Planned checks (automated and manual)

Show the user a summary of the created task when done.
