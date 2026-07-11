# Noridoc: setup

Path: @/ui/pages/setup

### Overview

- The Setup station (ENG-243): session creation (PRD v2 §8.1, redesign §6.1). A **facilitator** surface (§7.2 — denser text/counters allowed). Picks a bucket audio (§7.4, with the collection-consent indicator §12/O6), a granularity **level** (Pequena/Média/Grande — there is **no numeric bead-seconds field**, §6.1/§8.1), names the story (falls back to the filename without extension), and confirms pipeline-use consent.
- On create: `GranularityResolver.resolve(level, acousteme)` → beadSec, `BucketSource.fetchBytes` → `AudioEngine.decode` → `buildBeads` (grid) + `hashPCM` (manifest_id) client-side → `SessionStore.create` → persist the initial DTO (`toSessionDto` via `autosave`+`flush`, so the session is resumable/exportable) → `sessionStore.load(state)` (the live domain session) → `navigate('/session/:id')`. The shell then renders **Escuta 1** because a fresh session is `mode='escuta'` + `whole.confirmed=false`.
- `Setup({ bucket, resolver, audioEngine, store, projectId, navigate })` — ports arrive **by prop** in tests; in production they resolve the fixture singletons in `ports.ts`. `navigate` is injectable so tests observe the async navigation without touching history.

### How it fits into the larger codebase

- **Not yet a routed station.** The shell (@/ui/app/App.tsx) routes only `/login`, `/dashboard`, `/session/:id`; `/setup` is **not** wired (the dashboard's "Nova sessão" navigates to `/setup`, which currently falls back to `dashboard`). Routing `/setup` → the `setup` station is a **shell follow-up**, mirroring how ENG-246 Export deferred its shell wiring. The station registry auto-discovers `ui/pages/setup/index.tsx` by glob; the page is otherwise self-contained and tested directly.
- **Radix radio-group** (`@radix-ui/react-radio-group`, added by this issue) drives the three entry doors (§8.9: _Começar do zero_ / _Confirmar uma entrega_ / _Retomar um retorno_), the three granularity level cards, and the audio picker — roving focus + ARIA for free. The two import doors navigate to `/imports` (the pipeline files station, ENG-248; the shell fallback renders until it lands).
- **Reference faithfulness (docs/reference/index.html `segment()`).** slug = `title.trim() || filename-without-extension || 'colar'`; decode failure copy `Não consegui decodificar este áudio (…). Tente um WAV PCM.`; no-audio `Escolha um arquivo de áudio primeiro.`; the bead-lock note `Trave o tamanho da conta antes de ancorar. Mudá-lo depois desloca as fronteiras.` (meaning preserved without the removed numeric field). Pinned trust line (§O7): `Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso.`
- **Boundaries.** `try/catch` wraps ONLY the `AudioEngine.decode` call (the typed `AudioDecodeError` boundary); grid/hash/`createSession` are pure and `SessionStore` IO bubbles (CLAUDE.md). Consent gate: an unchecked pipeline-consent checkbox blocks creation (`Confirme o consentimento de uso no pipeline para continuar.`).
- **`ports.ts`** — module singletons `defaultBucket()`/`defaultResolver()`/`defaultAudioEngine()`/`defaultSessionStore()` (fixture). Env-based real-adapter selection and an app-global store shared with the Dashboard are composition-root wiring (ENG-247/shell follow-up), out of scope here; the defaults are production-only and intentionally untested (tests inject the ports).

### Known follow-ups

- Route `/setup` in the shell and pass an app-global `SessionStore`/`AudioEngine.createPlayer` player through to Escuta 1 (shell wiring).
- `projectId` defaults to `'projeto'`; the real project comes from auth once the composition root exists (ENG-247).
