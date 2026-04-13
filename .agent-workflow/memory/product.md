# Product Memory

## Product truth

- Zhitu is a full-stack web app with separated frontend and backend. This repository is the frontend UI.
- The UI provides routes for welcome, path, community list/detail, community publish, chat list/detail, and login.
- The frontend talks to the backend through a base API URL and expects auth tokens.

## Current constraints

- Technical constraints: React 19 + TypeScript + Vite, React Router v7, Redux Toolkit, Ant Design. Axios wrapper in src/utils/http.ts attaches tokens and handles refresh.
- Compliance constraints: unknown.
- Operational constraints: local dev uses Vite; backend is required for API calls.

## Open questions

- Primary user goals and success metrics.
- Exact backend data contracts and required endpoints.
- Production deployment targets and environment setup.
