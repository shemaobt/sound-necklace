# Noridoc: login

Path: @/ui/pages/login

### Overview

- The Login station (ENG-245): the facilitator entry (PRD v2 §7.1). A calm cream card with two fields (Usuário/Senha) and a dark submit; success routes to the dashboard, a rejected credential shows one PT-BR guidance line and keeps the login screen.
- `Login({ auth })` — the `AuthProvider` port (@/adapters/api) arrives **by prop** in tests; in production it resolves the fixture singleton shared with the dashboard (@/ui/pages/dashboard/ports.ts), so the auth the login logs into is the SAME instance the dashboard watches for expiry.
- The submit is a native `<form>` + `<button type="submit">` (Enter-to-submit) styled in `login.css` — deliberately NOT the `Button` atom (which is `type="button"` and cannot submit).

### How it fits into the larger codebase

- **Routed station.** The shell (@/ui/app/App.tsx) renders station key `login` for `/login` via `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts), so the default export in `index.tsx` is mandatory. Navigation uses the minimal History-API router (@/ui/app/router.ts) — success calls `navigate('/dashboard')`.
- **System-boundary error handling.** Only `AuthError` (credential rejection) becomes the PT-BR guidance; any other failure bubbles (not masked). The in-memory app state is never touched here — session hygiene (§7.1/§12) is the `AuthProvider`'s job.
- **Fixture credentials.** `FixtureAuthProvider` accepts a known username (`facilitadora`/`admin`) + any non-empty password; no credential literal lives in the repo.
