# Noridoc: dashboard

Path: @/ui/pages/dashboard

### Overview

- The Sessions dashboard (ENG-245, redesigned to the Shemá v2 prototype in ENG-278): the post-login home (PRD v2 §7.2). Lists ALL the facilitator's sessions as a **grid of story cards** — story name, `slug · project`, status, last-modified, and a glanceable progress cover; resumes an in-progress session straight into its saved step; downloads the three artifacts of a completed session **without opening it**; and starts a new story.
- `Dashboard({ auth, store, saveBytes })` — the `AuthProvider` + `SessionStore` ports arrive **by prop** in tests; in production they resolve the fixture singletons in @/ui/pages/dashboard/ports.ts. The real download is the injectable `saveBytes(filename, bytes)` boundary (default Blob/anchor).
- **A full-bleed surface with its OWN header** (brand + the authenticated user + "Sair"), like @/ui/pages/login: the shell suppresses its utility header on both routes, so this page owns the top of the screen.
- **Direct downloads reuse the stored opaque bytes** (§10.5): `store.getArtifacts(id)[kind]` → `saveBytes` with `<slug>-anchoring-return.json` / `-bead-manifest.json` / `-mapping-report.md` (filenames via the @/contracts helpers). Nothing is rebuilt on the dashboard.

### How it fits into the larger codebase

- **Routed station.** The shell (@/ui/app/App.tsx) renders station key `dashboard` for `/` and `/dashboard` via the `import.meta.glob` station registry. Resume/open call `navigate('/session/:id')`; the shell rehydrates the persisted session and resumes at the saved step (§7.3, `useSessionHydration`). "Nova sessão" calls `navigate('/setup')`, which the shell now routes to the Setup station (ENG-272).
- **Presentational organisms, props only.** Renders @/ui/organisms/session-list (status + last-modified + progress glance; the page maps `SessionSummary` → `SessionCardData`, formats the date, and derives the six-station glance from `progress.current_step`) and, per completed session, @/ui/organisms/artifact-cards (the three DocumentCards). Direct import (the organisms barrel is frozen).
- **Language-aware formatting** (ENG-279, @/ui/i18n/docs.md). The six station labels of the glance are dictionary keys resolved here, and `formatWhen(iso, locale)` takes a locale (`pt-BR` default, `en-US` under an EN UI) so `toLocaleString` dates follow the UI language. This page owns its OWN copy of the station labels — the shell's stepper (@/ui/app/stepper-model.ts) still hardcodes PT-BR for the same six words.
- **Auth expiry (§7.1).** Subscribes `auth.onAuthExpired(() => navigate('/login'))` — routes back to login **without touching the store** (the caller's in-memory state is preserved so re-login resumes). Shared-singleton `ports.ts` makes the login's auth and the dashboard's the same instance. The app root (@/ui/app/App.tsx `useAuthExpiry`) now subscribes the SAME singleton too, so expiry also routes to login from inside a live `/session/:id` (ENG-277); the dashboard keeps its own subscription harmlessly (both just navigate).
- **`ports.ts`** — `defaultAuth()` delegates to the **app-global** `appAuth()` singleton (@/ui/app/auth-adapter.ts, ENG-277), so Login, Dashboard and the session root all share ONE `AuthProvider` — a single expiry trigger reaches every surface. `defaultSessionStore()` returns the **app-global** `appSessionStore()` (@/ui/app/session-adapter.ts, ENG-272), the same store Setup writes to and Export reads, so a session created in Setup appears in this list. Env-based real-adapter selection is composition-root wiring (ENG-247), out of scope here; the defaults are production-only and intentionally untested (tests inject the ports).
- **Routed station.** The shell (@/ui/app/App.tsx) renders station key `dashboard` for `/` and `/dashboard` via the `import.meta.glob` station registry. Resume/open call `navigate('/session/:id')`; the shell rehydrates the persisted session and resumes at the saved step (§7.3, `useSessionHydration`). The new-story card calls `navigate('/setup')`, which the shell routes to the Setup station (ENG-272).
- **The shell hands over the header** (@/ui/app/App.tsx `ownsHeader`): `login` and `dashboard` render NO @/ui/app/header.tsx. Both the shell header and this page's header carry an `<h1>Colar de Sons</h1>` and a `<header>` banner, so stacking them would duplicate both. Consequence: the shell's sound toggle does not exist here — this is a facilitator surface with no playback (the stations keep it).
- **Presentational organisms, props only.** Renders @/ui/organisms/session-list (the story cards) and, per completed session, @/ui/organisms/artifact-cards (the three DocumentCards). Direct import — the organisms barrel is frozen.
- **The page does all the arithmetic the organisms refuse to do**: `formatWhen` turns `last_modified` into a display string, and `progressOf` turns the saved `current_step` into a `{ progress, label }` pair. `toCard` maps a @/contracts `SessionSummary` onto the organism's `SessionCardData`, including the `in_progress`/`completed` → `in-progress`/`completed` status translation (the wire uses underscores, the organism's `data-status` uses hyphens).
- **Auth expiry (§7.1).** Subscribes `auth.onAuthExpired(() => navigate('/login'))` — routes back to login **without touching the store** (the caller's in-memory state is preserved so re-login resumes). The app root (@/ui/app/App.tsx `useAuthExpiry`) subscribes the SAME singleton (ENG-277), so expiry also routes from inside a live `/session/:id`; the dashboard keeps its own subscription harmlessly (both just navigate). "Sair" is the explicit counterpart: `auth.logout()` then `/login`.
- **@/ui/pages/dashboard/ports.ts** — `defaultAuth()` delegates to the **app-global** `appAuth()` singleton (@/ui/app/auth-adapter.ts), so Login, Dashboard and the session root share ONE `AuthProvider` and a single expiry trigger reaches every surface. `defaultSessionStore()` returns the **app-global** `appSessionStore()` (@/ui/app/session-adapter.ts), the same store Setup writes to and Export reads, so a session created in Setup appears in this list. Env-based real-adapter selection is composition-root wiring (ENG-247), out of scope here; the defaults are production-only and intentionally untested (tests inject the ports).

```
FixtureSessionStore ─ list() ──▶ SessionSummary[] ─ toCard ─▶ SessionCardData ─▶ SessionList
        │                                                    (progressOf/formatWhen)
        └─ getArtifacts(id) ──▶ opaque bytes ─ saveBytes ──▶ ArtifactCards (completed only)

FixtureAuthProvider ─ currentUser() ──▶ own header    onAuthExpired/logout ──▶ /login
```

### Core Implementation

- **`progressOf(step)` is the §7.2 "glanceable progress indicator"**, reduced to two values the organism can render: `progress = (i + 1) / 6` over the six `STEPS` of the fio de contas (ouvir → cortar → triage → frases → conversa → guardar) and the accessible label `progresso: <Estação> — passo <n> de 6`. An unrecognized step clamps to the first station (`Math.max(0, findIndex)`), so a bad DTO renders a card instead of throwing.
- **Own header:** the Shemá icon (@/ui/tokens `ShemaIcon`, `telha` colorway on cream), `<h1>Colar de Sons</h1>`, then the user block — rendered ONLY when `auth.currentUser()` is non-null — with the `username` as text plus an `aria-hidden` avatar holding its first initial (decorative: the username is already the accessible text), and the ghost "Sair" button.
- **Body headings:** an "Arquivo oral" eyebrow, `<h2>Suas histórias</h2>`, and a story count (`1 história` / `N histórias`) rendered only once the listing resolves. Digits are fine — facilitator density (§9.2 constrains listener surfaces only).
- **Loading vs empty are different shapes.** While `sessions === null` a `role="status"` line says "Carregando as sessões…". There is no empty-state paragraph anymore: an empty list renders the grid containing only the "Comece uma nova história" card, which IS the empty state and the new-story affordance at once.
- **Downloads section (unchanged, §7.2/§10.5):** one `<section>` per completed session, its story name as an `<h3>`, and an `ArtifactCards` whose `downloaded` flags come from a `Set` of `${id}:${kind}` keys held in page state — so the Baixar→baixado flip is per session AND per artifact.

### Things to Know

- **Prototype ↔ contract reconciliations (ENG-278).** CLAUDE.md precedence: look/layout follows the prototype, but behavior and data follow the PRD/contracts — so where the prototype implies data that does not exist, the data wins.

  | Prototype (Shemá v2)                                        | Shipped                                    | Why                                                                                                                                                     |
  | ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Kebab menu: renomear / duplicar / excluir / só para revisão | Not ported                                 | @/adapters/sessions exposes no rename/duplicate/delete, and §7.2 does not list them. Adding them is a contract-critical follow-up, outside `ui/` scope. |
  | Downloads hidden inside that kebab                          | The `ArtifactCards` section below the grid | §7.2/§10.5 requires the three artifacts downloadable from the dashboard; the existing organism already carries the contractual copy.                    |
  | Full name + e-mail ("Marcia Alencar / marcia@shema.org")    | `username` + initial                       | `AuthUser` is `{ id, username, roles }` (@/adapters/api/types.ts) — the prototype's identity is mock data; nothing is invented.                         |
  | A third status, "Em revisão"                                | Only `in_progress` / `completed`           | Those are the two statuses the contract carries (@/contracts). Review mode is a per-open state (§7.3/§8.10), not a session status.                      |
  | Card shows the slug only                                    | `slug · project`                           | §7.2 explicitly requires project on the card.                                                                                                           |

- **The old chrome is gone**: no `<h1>Minhas sessões</h1>` (the h1 is now the brand, and the page title is the h2 "Suas histórias") and no header "Nova sessão" button — the grid's dashed card replaced it. Tests and e2e that key on those strings must target the new ones.
- **A story named "Em andamento" collides with the status chip label** in test queries (the chip text is now "Em andamento"/"Concluída"). The page's own tests renamed the fixture story for exactly this reason.
- The page never opens a completed session to download it, and it never rebuilds an artifact — the bytes are opaque strings persisted at completion. Byte-identity is asserted end-to-end in @/tests/e2e/dashboard-retrieval.spec.ts.
- `saveBytes` is the only real DOM/browser boundary here (Blob + anchor click + a deferred `revokeObjectURL`); tests inject a spy instead, which is why the download path needs no jsdom download support.

Created and maintained by Nori.
