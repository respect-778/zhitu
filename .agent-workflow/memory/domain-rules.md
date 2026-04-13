# Domain Rules

## Rules that must stay true

- Authenticated requests attach a Bearer token from localStorage key "token" unless skipAuth is set.
- On 401, the client attempts /user/refresh unless skipRefresh is set; failure clears auth state and redirects to /login.
- API base URL is read from VITE_BASE_URL.

## Contract assumptions

- Backend exposes /user/refresh and login-related endpoints expected by the frontend.
- In dev, /api is proxied to the backend (VITE_BASE_URL defaults to /api).

## Forbidden shortcuts

- Hardcoding an absolute API base URL in code.
- Changing auth storage keys (token/username/userInfo) without updating src/utils/http.ts.
- Bypassing AuthRouter for protected routes without updating routing and auth expectations.
