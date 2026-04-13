Record evidence for the current task and refresh the checkpoint.

Steps:
1. Run `npx agent-workflow task:list --root .` to find the active task
2. Identify which files you changed that are within the task scope
3. For each scoped file you changed, prepare a --proof-path and a --check
4. Record evidence:
   ```bash
   npx agent-workflow run:add <taskId> "<one-line summary>" \
     --status passed \
     --proof-path <file1> \
     --proof-path <file2> \
     --check "<what you verified for file1>" \
     --check "<what you verified for file2>" \
     --root .
   ```
   Use `--status draft` if verification is incomplete.
5. Run `npx agent-workflow checkpoint <taskId> --root .`
6. Show the user the checkpoint summary from `.agent-workflow/tasks/<taskId>/checkpoint.md`
