# Noridoc: login

Path: @/ui/pages/login

### Overview

- The Login station (ENG-245): the facilitator entry (PRD v2 §7.1). A calm cream card with two fields (user/password) and a dark submit; success routes to the dashboard, a rejected credential shows one guidance line and keeps the login screen. All of its copy comes from @/ui/i18n (PT-BR default, EN via the header toggle) — it is the first screen a facilitator sees, so it is also the first proof the language choice survived the reload.
- The Login station (ENG-245, restyled to the Shemá v2 opening in ENG-278): the facilitator entry (PRD v2 §7.1). A **two-panel opening** — left, a ceremonial brand panel (`ShemaIcon colorway="branco"` from @/ui/tokens over the olive `--cds-olive` field) carrying the verse "Assim na terra como no céu.", a tagline, and the privacy line "Nada do áudio sai deste computador."; right, the calm cream form (`--cds-cream`) with eyebrow "Entrar", heading "Bem-vinda de volta.", subtitle "Continue de onde vocês pararam.", the Usuário/Senha fields, and a telha (`--cds-telha`) submit that reads "Entrando…" while auth is pending. Success routes to the dashboard; a rejected credential shows one PT-BR guidance line and keeps the login screen.
- `Login({ auth })` — the `AuthProvider` port (@/adapters/api) arrives **by prop** in tests; in production it resolves the fixture singleton shared with the dashboard (@/ui/pages/dashboard/ports.ts), so the auth the login logs into is the SAME instance the dashboard watches for expiry.
- The submit is a native `<form>` + `<button type="submit">` (Enter-to-submit) styled in `login.css` — deliberately NOT the `Button` atom (which is `type="button"` and cannot submit).
- **Reconciliations prototype ↔ contract** (CLAUDE.md precedence rule 1 — data wins over the prototype's look, whose source is @/docs/design/README.md): the field stays "Usuário"/`username` (the auth contract keys on `username`; fixture/e2e use `facilitadora`/`admin`) rather than the prototype's "E-mail"; the prototype's `noop` "Criar conta"/"Esqueceu a senha?" links are omitted (no MVP flow); the brand mark is `ShemaIcon` because there is no svg-asset pipeline for the prototype's `logo-branco.svg` wordmark or `pattern-tile.svg`. Focus outline and `prefers-reduced-motion` are inherited from the global @/ui/tokens/base.css floor — no per-file duplication.

### How it fits into the larger codebase

- **Routed station.** The shell (@/ui/app/App.tsx) renders station key `login` for `/login` via `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts), so the default export in `index.tsx` is mandatory. Navigation uses the minimal History-API router (@/ui/app/router.ts) — success calls `navigate('/dashboard')`.
- **System-boundary error handling.** Only `AuthError` (credential rejection) becomes the guidance line; any other failure bubbles (not masked). The in-memory app state is never touched here — session hygiene (§7.1/§12) is the `AuthProvider`'s job.
- **Fixture credentials.** `FixtureAuthProvider` accepts a known username (`facilitadora`/`admin`) + any non-empty password; no credential literal lives in the repo.
