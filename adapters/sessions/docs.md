# Noridoc: adapters/sessions

Path: @/adapters/sessions

### Overview

- The session-persistence port (ENG-240, PRD v2 §7.3): continuous full-state autosave (no explicit save action), resume from any machine, the completed/in-progress lifecycle with the opaque artifact trio, a single-editor advisory lock, and the `respostas/*.webm` voice resources.
- `SessionStore` (@/adapters/sessions/types.ts) is the port; it ships the headless `FixtureSessionStore` (default) and an injected-`fetch` `HttpSessionStore` skeleton, plus the reusable `createAutosaver` state machine shared by both, following the same port + real + fixture + `register.ts` shape as @/adapters/audio and @/adapters/connectivity (see @/adapters/docs.md).
- Exists so the whole app, dashboard, and every UI/E2E test run with no real backend; the real HTTP mode wires in later by environment config (ENG-247).

### How it fits into the larger codebase

- Consumes @/contracts DTOs (`SessionStateDto`, `SessionSummary`, `ArtifactTriple`, `LockStatus`, `SessionStep`, `ResourcePath`, `CreateSessionRequest` from @/contracts/api.ts and @/contracts/session-state.ts). It imports the connectivity port (@/adapters/connectivity/types.ts) for the offline pause; it needs nothing from @/domain and never imports `ui/` — @/.dependency-cruiser.cjs enforces both directions.
- Resolved by the composition root @/ui/app: @/adapters/sessions/register.ts default-exports `{ port: 'sessions', fixture, real }`, globbed via `import.meta.glob('/adapters/*/register.ts')` (@/docs/architecture.md §4). Fixture is the default; `real` builds an `HttpSessionStore` against a relative `/api` baseUrl using the browser fetch/connectivity until ENG-247 injects real baseUrl/token/user.
- Consumed by `ui/` only through the port and props/wiring (Setup creates, Dashboard lists/resumes, Export completes/reads artifacts). The listener-facing autosave freeze pairs with the connectivity gate (@/adapters/connectivity/docs.md) — losing connection pauses saving without clearing state.

```
Setup ─create()─▶ SessionSummary ──▶ Dashboard list()/get()
  │ autosave(state) (debounced, offline-paused)
  ▼
FixtureSessionStore ── over ──▶ FixtureSessionBackend (shared "server")
  │  clone in / clone out (opaque custody)      │ optional mirror
  │                                             ▼
Export ─complete(state, artifacts)─▶      KeyValueStorage (localStorage)
        getArtifacts() byte-identical      key colar-de-sons:sessions:v1
```

### Core Implementation

- **`createAutosaver`** (@/adapters/sessions/autosave.ts) — the shared autosave machine both stores delegate to. It coalesces per session via a `Map` (last state wins), debounces bursts with `setTimeout`, retries a failed `persist` with exponential backoff, and **pauses while offline**: `drain`/`persistOne` early-return when the injected `ConnectivityMonitor` reports offline, keeping the pending state; a `subscribe` callback re-arms the timer on reconnect so nothing is lost (PRD §13). The persistence target is injected, so the fixture writes to its backend and the HTTP store issues a PUT.
- **`FixtureSessionStore`** (@/adapters/sessions/fixture.ts, the DEFAULT) — built over a **shareable** `FixtureSessionBackend` (the simulated server). Two stores over one backend are two users on one server, which is what exercises the advisory lock. The backend optionally mirrors its JSON-able records (summaries/state/artifacts/lock) to a `KeyValueStorage` (localStorage shape) under `colar-de-sons:sessions:v1` and hydrates from it on construction; voice-resource bytes live in memory only. The dashboard step (`SessionSummary.progress.current_step`) is derived from the saved state's `mode`/status via `stepFor`.
- **`HttpSessionStore`** (@/adapters/sessions/http.ts) — real skeleton mapping each port method to a tripod-api endpoint with an **injected** `fetch` (no network in CI) and a Bearer-token getter. JSON responses that are contract-shaped (`SessionSummary`, list, `LockStatus`) are schema-parsed; the opaque state/artifacts and the WebM resource bytes travel without re-serialization. Endpoints are **provisional** until the OpenAPI lands (ENG-211/ENG-247).
- @/adapters/sessions/index.ts is the public barrel for the wiring layer and tests; app code resolves the store via the `sessions` port, not by importing implementations.

### Things to Know

- **Custody is opaque (§10.5):** state and artifacts round-trip byte-identical. The fixture deep-clones (`structuredClone`) both in and out and never re-serializes or reinterprets the payload shape; `HttpSessionStore.load`/`getArtifacts` return the raw payload as-is (deep validation is the state layer's job, not the store's). This byte-identity is what keeps the golden harness green.
- **The advisory lock never throws on conflict.** `acquireLock` returns a `LockStatus`; if the holder is another user, the caller opens review-mode (§7.3). The lock is per-user with a TTL (`lockTtlMs`, default 30s) and self-expires if the holder disappears — `#heldByOther`/`lockStatusOf` treat an expired lock as free.
- `load`/`getArtifacts` on a session that was never saved/completed throw `SessionNotFoundError` (also raised for an unknown id), the typed surface the UI shows copy for.
- Fixture `autosave` schedules a **clone** of the state so a later caller mutation cannot rewrite an already-queued save; the coalescing map still lets a genuinely newer `autosave` win.
- `flush` and the autosaver are **no-ops while offline** — a forced flush on navigation only persists when online; the pending state waits for reconnect.
- The fixture's `latencyMs`/`#settle` inject optional per-op delay for realistic wiring tests; tests otherwise drive the autosaver with fake timers (debounce/backoff are `setTimeout`-based).
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).

Created and maintained by Nori.
