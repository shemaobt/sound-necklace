# Noridoc: adapters/api

Path: @/adapters/api

### Overview

- The tripod-api access ports (ENG-239, PRD v2 §7.1/§5/§12): `AuthProvider` (login/logout/`currentUser`/`token`/refresh/`resume` against the shared API's existing JWT Bearer scheme — the SPA adds no scheme of its own) and `ApiClient` (a typed `fetch` wrapper: Bearer injection, `onAuthExpired` fired **once** per expired token on a 401, JSON error-envelope → `ApiError`).
- Ships the headless `FixtureAuthProvider` + `FixtureApiClient` (default) and the real injected-`fetch` `HttpAuthProvider` + `HttpApiClient` (the house wire, reconciled with the tripod-api OpenAPI during ENG-247), following the same port + real + fixture + `register.ts` shape as @/adapters/sessions and @/adapters/audio (see @/adapters/docs.md).
- Exists so login works end-to-end with no real backend (dashboard, every UI/E2E test); the real mode is mounted by the composition root under `VITE_API_MODE=real` (@/ui/app/auth-adapter.ts, ENG-247), fixture stays the default.

### How it fits into the larger codebase

- Consumes @/contracts DTOs only (the auth schemas of @/contracts/api.ts — the `AuthResponse` login envelope, the rotating `TokenResponse` pair, the platform `UserResponse`, and the app roles). Needs nothing from @/domain and never imports `ui/` — @/.dependency-cruiser.cjs enforces both directions.
- @/adapters/api/register.ts default-exports `{ port: 'auth', fixture, real }` per the registry convention (@/docs/architecture.md §4), but the app's actual wiring is the mode-aware app-global singleton `appAuth()` in @/ui/app/auth-adapter.ts — one shared provider so a single expiry trigger reaches every surface, with `authReady()` as the single-flight boot resume everything token-dependent awaits. `ApiClient` is **not** a separately-resolved port — it is a transport building block with an injected token getter.
- The `token()` the `AuthProvider` exposes is what other adapters inject as their Bearer source; the `onAuthExpired` event is what the login/dashboard wiring subscribes to in order to return to the login screen without discarding in-memory work.

```
Login ─login(creds)─▶ AuthUser (+ token in memory)     onAuthExpired ─▶ back to login
  │                                                       ▲ (fires once per expired token)
  ▼                                                       │
FixtureAuthProvider (in-memory users)            HttpApiClient 401 ──┘
  simulateExpiry() ─fires event, drops token─┘    (real client, injected fetch)
```

### Core Implementation

- **`types.ts`** — the two ports plus typed errors: `AuthError` (bad credentials / no session — the UI shows copy) and `ApiError` (non-2xx, carrying `status` + the parsed error `body`). `Credentials`/`AuthUser` reuse the contract DTOs.
- **`FixtureAuthProvider`** (@/adapters/api/fixture.ts, the DEFAULT) — a login is a known `DEFAULT_FIXTURE_USERS` username (one `facilitator` + one `project_admin`) plus a non-empty password; it stores **no** password, so there is no credential literal in the repo (the real credential check is the server's). It mints **deterministic** tokens (`sessao-<user>-<nonce>` — the nonce makes every login/refresh distinct) and exposes `simulateExpiry()` to drop the token and fire `onAuthExpired` for the re-login gate. It never touches caller-owned state.
- **`FixtureApiClient`** (@/adapters/api/fixture.ts) — an in-memory `ApiClient` with a `routes` resolver and a `setExpired` switch; a 401 fires `onAuthExpired` **once** while expired and rejects with `ApiError`.
- **`HttpApiClient`** (@/adapters/api/client.ts) — the real transport: injected `fetch` (no network in CI), Bearer injection from `getToken`, `#reportExpired` guarding the once-per-token semantics, and `#parseBody` turning a FastAPI `{ detail }` envelope into the `ApiError` message. `suppressAuthExpired` marks unauthenticated endpoints (login/refresh) where a 401 is a credential error, not session expiry.
- **`HttpAuthProvider`** (@/adapters/api/client.ts) — the real house wire. Login `POST /auth/login` authenticates **by email** and returns the `AuthResponse` envelope (platform user + rotating token pair); a 401 there is a credential error, not expiry (`suppressAuthExpired`), translated into `AuthError`. App roles come from `GET /auth/my-roles?app_key=sound-necklace` (the platform `/me` carries none) — unknown `role_key`s are ignored, and a valid platform account with **zero** Colar roles is refused ("sem acesso ao Colar de Sons") with the tokens dropped. `resume()` exchanges the persisted refresh token for a fresh pair, re-fetches user + roles and re-arms the schedule; an API refusal clears the persisted refresh (dead session) while a network failure preserves it for the next boot. The access token auto-refreshes on a timer armed from the JWT's own `exp` (with a safety margin); a failed scheduled refresh clears everything and fires auth-expired, so the app returns to login instead of degrading silently. Logout revokes the refresh token best-effort.
- @/adapters/api/index.ts is the public barrel; app code resolves the provider via the `auth` port, not by importing implementations.

### Things to Know

- **The access token lives in memory only; the rotating refresh token persists** (§12 as amended by owner decision, ENG-247): `HttpAuthProvider` writes it under a namespaced localStorage key through an optional injected `storage`, which is what lets `resume()` survive a reload/reopen without a login screen. Storage failures (quota, private mode) degrade to memory-only, never break login. Expiry still returns to login but the adapter **never clears app state**: the in-memory session/story work is the caller's, and re-login resumes it untouched (a unit test asserts a caller object is unchanged across an expiry → re-login cycle).
- **Auth-expired fires once.** Both clients guard so repeated 401s under the same expired token notify a single time; a fresh token (re-login) re-arms it. The real client tracks the last-expired token; the fixture tracks a boolean reset by `setExpired(false)`.
- **`ApiClient` is a building block, not a resolved port** — only `auth` is registered. Real adapters bring their own injected-`fetch` wrapper with a token getter (@/adapters/sessions/http.ts rolls its own around the same `ApiError`), so there is no second registration.
- **Refresh is rotating:** every `refresh()`/`resume()` answers with a NEW refresh token and the old one dies on use — always persist the latest pair; replaying a spent refresh token is a rejection. The fixture's `resume()` deliberately persists nothing: it just returns whatever user is already in memory.
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).

Created and maintained by Nori.
