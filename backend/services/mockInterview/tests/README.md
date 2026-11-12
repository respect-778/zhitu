# tests/

Cross-cutting / end-to-end tests that span multiple packages (e.g. web ⇄ agent contract
round-trips, full-stack smoke tests). Per-package unit tests live with their packages:

- `packages/shared/test` (vitest — TS contracts)
- `apps/web/test` (vitest — web lib/utils)
- `apps/agent/tests` (pytest — prep/live/post, mock adapters)
- `services/lightrag` (pytest — naive RAG backend)

Populated as the stack comes online.
