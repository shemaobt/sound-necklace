# Noridoc: dashboard

Path: @/ui/pages/dashboard

### Overview

- The Sessions dashboard (ENG-245): the post-login home (PRD v2 §7.2). Lists ALL the facilitator's sessions with status, last-modified, and a glanceable fio-de-contas progress; resumes an in-progress session straight into its saved step; downloads the three artifacts of a completed session **without opening it**; and starts a new session.
- `Dashboard({ auth, store, saveBytes })` — the `AuthProvider` + `SessionStore` ports arrive **by prop** in tests; in production they resolve the fixture singletons in `ports.ts`. The real download is the injectable `saveBytes(filename, bytes)` boundary (default Blob/anchor).
- **Direct downloads reuse the stored opaque bytes** (§10.5): `store.getArtifacts(id)[kind]` → `saveBytes` with `<slug>-retorno-ancoragem.json` / `-manifesto-contas.json` / `-relatorio-mapeamento.md` (filenames via the @/contracts helpers). Nothing is rebuilt on the dashboard.

### How it fits into the larger codebase

- **Routed station.** The shell (@/ui/app/App.tsx) renders station key `dashboard` for `/` and `/dashboard` via the `import.meta.glob` station registry. Resume/open call `navigate('/session/:id')`; the shell rehydrates the persisted session and resumes at the saved step (§7.3, `useSessionHydration`). "Nova sessão" calls `navigate('/setup')`, which the shell now routes to the Setup station (ENG-272).
- **Presentational organisms, props only.** Renders @/ui/organisms/session-list (status + last-modified + progress glance; the page maps `SessionSummary` → `SessionCardData`, formats the date, and derives the six-station glance from `progress.current_step`) and, per completed session, @/ui/organisms/artifact-cards (the three DocumentCards). Direct import (the organisms barrel is frozen).
- **Auth expiry (§7.1).** Subscribes `auth.onAuthExpired(() => navigate('/login'))` — routes back to login **without touching the store** (the caller's in-memory state is preserved so re-login resumes). Shared-singleton `ports.ts` makes the login's auth and the dashboard's the same instance.
- **`ports.ts`** — `defaultAuth()` is a module fixture singleton; `defaultSessionStore()` returns the **app-global** `appSessionStore()` (@/ui/app/session-adapter.ts, ENG-272), the same store Setup writes to and Export reads, so a session created in Setup appears in this list. Env-based real-adapter selection is composition-root wiring (ENG-247), out of scope here; the defaults are production-only and intentionally untested (tests inject the ports).
