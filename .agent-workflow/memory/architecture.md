# Architecture Memory

## Current architecture

- Entry points: src/main.tsx and src/App.tsx.
- Routing: src/router/index.tsx uses createBrowserRouter, AuthRouter, and lazy-loaded pages.
- State: Redux Toolkit store in src/store with user and community slices.
- API: axios instance in src/utils/http.ts with token attach and refresh; localStorage helpers in src/utils/store.ts.
- UI: pages in src/pages, shared components in src/components, hooks/styles/types/utils in src/.

## Fragile areas

- Auth flow and token refresh behavior (401 handling and redirect to /login).
- Route structure for community and chat, including nested /chat/:id and /community routes.

## Invariants

- API base URL is provided by VITE_BASE_URL (env) and consumed by src/utils/http.ts.
- Router paths in src/router/index.tsx should stay consistent with page structure.
