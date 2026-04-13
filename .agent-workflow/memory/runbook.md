# Runbook

## Standard loops

1. npm install
2. npm run dev (local frontend)
3. update task docs and prompt
4. implement changes
5. npm run lint
6. npm run build (when applicable)
7. record evidence and update checkpoint

## Verification expectations

- Automated: npm run lint; npm run build for release readiness.
- Manual: open key routes (/, /community, /community/:id, /community/publish, /chat, /chat/:id, /login) and confirm no console errors.
- Gaps: no automated UI or API contract tests found in this repo.
