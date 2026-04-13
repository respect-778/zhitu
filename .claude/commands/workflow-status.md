Show the current workflow state and highlight any issues.

Steps:
1. Run `npx agent-workflow task:list --root .`
2. Run `npx agent-workflow validate --root .`
3. Read and summarize:
   - Total tasks and their statuses (todo / in_progress / done)
   - Which tasks have strong proof, which need proof
   - Any validation warnings or errors
4. If there are risks or stale docs, tell the user what needs attention
5. Suggest next actions (e.g. "T-002 needs proof for src/auth.js")
