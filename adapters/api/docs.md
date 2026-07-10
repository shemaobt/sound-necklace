# Noridoc: adapters/api

Path: @/adapters/api

### Overview

- The tripod-api access ports (ENG-239, PRD v2 §7.1/§5/§12): `AuthProvider` (login/logout/`currentUser`/`token`/refresh against the shared API's existing JWT Bearer scheme — the SPA adds no scheme of its own) and `ApiClient` (a typed `fetch` wrapper: Bearer injection, `onAuthExpired` fired **once** per expired token on a 401, JSON error-envelope → `ApiError`).
- Ships the headless `FixtureAuthProvider` + `FixtureApiClient` (default) and the injected-`fetch` `HttpAuthProvider` + `HttpApiClient` skeleton, following the same port + real + fixture + `register.ts` shape as @/adapters/sessions and @/adapters/audio (see @/adapters/docs.md).
- Exists so login works end-to-end with no real backend (dashboard, every UI/E2E test); the real HTTP mode wires in later by environment config (ENG-247).

### How it fits into the larger codebase

- Consumes @/contracts DTOs only (`LoginRequest`, `MeResponse`, `Role`, `TokenResponseSchema`, `MeResponseSchema` from @/contracts/api.ts). Needs nothing from @/domain and never imports `ui/` — @/.dependency-cruiser.cjs enforces both directions.
- Resolved by the composition root @/ui/app: @/adapters/api/register.ts default-exports `{ port: 'auth', fixture, real }`, globbed via `import.meta.glob('/adapters/*/register.ts')` (@/docs/architecture.md §4). `ApiClient` is **not** a separately-resolved port — it is the transport the real adapters (e.g. @/adapters/sessions/http.ts) build internally with an injected token getter.
- The `token()` the `AuthProvider` exposes is what other adapters inject as their Bearer source; the `onAuthExpired` event is what the login/dashboard wiring subscribes to in order to return to the login screen without discarding in-memory work.

```
Login ─login(creds)─▶ AuthUser (+ token in memory)     onAuthExpired ─▶ back to login
  │                                                       ▲ (fires once per expired token)
  ▼                                                       │
FixtureAuthProvider (in-memory users)            HttpApiClient 401 ──┘
  simulateExpiry() ─fires event, drops token─┘    (real skeleton, injected fetch)
```

### Core Implementation

- **`types.ts`** — the two ports plus typed errors: `AuthError` (bad credentials / no session — the UI shows copy) and `ApiError` (non-2xx, carrying `status` + the parsed error `body`). `Credentials`/`AuthUser` reuse the contract DTOs.
- **`FixtureAuthProvider`** (@/adapters/api/fixture.ts, the DEFAULT) — a login is a known `DEFAULT_FIXTURE_USERS` username (one `facilitator` + one `project_admin`) plus a non-empty password; it stores **no** password, so there is no credential literal in the repo (the real credential check is the server's). It mints **deterministic** tokens (`sessao-<user>-<nonce>` — the nonce makes every login/refresh distinct) and exposes `simulateExpiry()` to drop the token and fire `onAuthExpired` for the re-login gate. It never touches caller-owned state.
- **`FixtureApiClient`** (@/adapters/api/fixture.ts) — an in-memory `ApiClient` with a `routes` resolver and a `setExpired` switch; a 401 fires `onAuthExpired` **once** while expired and rejects with `ApiError`.
- **`HttpApiClient`** (@/adapters/api/client.ts) — the real transport: injected `fetch` (no network in CI), Bearer injection from `getToken`, `#reportExpired` guarding the once-per-token semantics, and `#parseBody` turning a FastAPI `{ detail }` envelope into the `ApiError` message. `suppressAuthExpired` marks unauthenticated endpoints (login/refresh) where a 401 is a credential error, not session expiry.
- **`HttpAuthProvider`** (@/adapters/api/client.ts) — maps login → `POST /auth/login` (→ `TokenResponse`) then `GET /auth/me` (→ `MeResponse`), refresh → `POST /auth/refresh`, logout → clear. A rejected login is translated at that boundary into `AuthError`. Endpoints are **provisional** until the OpenAPI lands (ENG-211/ENG-247).
- @/adapters/api/index.ts is the public barrel; app code resolves the provider via the `auth` port, not by importing implementations.

### Things to Know

- **Tokens live in memory only (§12)** — never localStorage. Expiry returns to login but the adapter **never clears app state**: the in-memory session/story work is the caller's, and re-login resumes it untouched (a unit test asserts a caller object is unchanged across an expiry → re-login cycle).
- **Auth-expired fires once.** Both clients guard so repeated 401s under the same expired token notify a single time; a fresh token (re-login) re-arms it. The real client tracks the last-expired token; the fixture tracks a boolean reset by `setExpired(false)`.
- **`ApiClient` is a building block, not a resolved port** — only `auth` is registered. Real adapters construct their own `HttpApiClient`/fetch with a token getter (as @/adapters/sessions/http.ts already does), so there is no second registration.
- The real `refresh()` needs a refresh token; its acquisition from the login response is **provisional** (the contract's `TokenResponse` models only `access_token`) — seed it via the constructor until the real API shape lands. The tested refresh path is the fixture's (re-mint).
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).

Created and maintained by Nori.
