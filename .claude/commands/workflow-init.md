Initialize agent-workflow-studio in this repository and bootstrap project memory.

Steps:
1. Run `npx agent-workflow init --root .`
2. Run `npx agent-workflow scan --root .`
3. Run `npx agent-workflow memory:bootstrap --root .`
4. Read `.agent-workflow/handoffs/memory-bootstrap.md` and follow its instructions to fill the memory docs under `.agent-workflow/memory/`
5. After writing each memory doc, review it and remove any guesses not supported by actual code or docs
6. Run `npx agent-workflow validate --root .` to confirm the scaffold is healthy

Show the user a summary when done.
