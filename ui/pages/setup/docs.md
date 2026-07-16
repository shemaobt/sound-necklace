# Noridoc: setup

Path: @/ui/pages/setup

### Overview

- The Setup station (ENG-243): session creation (PRD v2 §8.1, redesign §6.1). A **facilitator** surface (§7.2 — denser text/counters allowed). Picks a bucket audio (§7.4, with the collection-consent indicator §12/O6), a granularity **level** (Pequena/Média/Grande — there is **no numeric bead-seconds field**, §6.1/§8.1), names the story (falls back to the filename without extension), and confirms pipeline-use consent.
- On create: `GranularityResolver.resolve(level, acousteme)` → beadSec, `BucketSource.fetchBytes` → `AudioEngine.decode` → `buildBeads` (grid) + `hashPCM` (manifest_id) client-side → `SessionStore.create` → persist the initial DTO (`toSessionDto` via `autosave`+`flush`, so the session is resumable/exportable) → `sessionStore.load(state)` (the live domain session) → `navigate('/session/:id')`. The shell then renders **Escuta 1** because a fresh session is `mode='escuta'` + `whole.confirmed=false`.
- `Setup({ bucket, resolver, audioEngine, store, projectId, navigate })` — ports arrive **by prop** in tests; in production they resolve the fixture singletons in `ports.ts`. `navigate` is injectable so tests observe the async navigation without touching history.

### How it fits into the larger codebase

- **Routed station** (ENG-272). The shell (@/ui/app/App.tsx) matches `/setup` and resolves the `setup` station, so the dashboard's "Nova sessão" reaches it. The station registry auto-discovers `ui/pages/setup/index.tsx` by glob; the page is otherwise self-contained and tested directly.
- **Radix radio-group** (`@radix-ui/react-radio-group`, added by this issue) drives the three entry doors (§8.9: _Começar do zero_ / _Confirmar uma entrega_ / _Retomar um retorno_), the three granularity level cards, and the audio picker — roving focus + ARIA for free. The two import doors navigate to `/imports` (the pipeline files station, ENG-248; the shell fallback renders until it lands).
- **Reference faithfulness (docs/reference/index.html `segment()`).** slug = `title.trim() || filename-without-extension || 'colar'`. The pinned copy — the §O7 trust line, the bead-lock note (meaning preserved without the removed numeric field), the decode-failure and no-audio messages — is unchanged in PT but now lives as dictionary values under the `setup` namespace in @/ui/i18n/pt.ts (with EN in `en.ts`), not as constants exported from this page. Tests assert against `pt.setup.*` so the pinned wording is still checked byte-for-byte.
- **Boundaries.** `try/catch` wraps ONLY the `AudioEngine.decode` call (the typed `AudioDecodeError` boundary); grid/hash/`createSession` are pure and `SessionStore` IO bubbles (CLAUDE.md). Consent gate: an unchecked pipeline-consent checkbox blocks creation, with the guidance line resolved from the dictionary. The decode error interpolates the engine's raw `detail` message into the translated frame — the detail itself is whatever the audio engine threw and is not translated.
- **`ports.ts`** — bucket/resolver/audio-engine are module fixture singletons; `defaultSessionStore()` returns the **app-global** `appSessionStore()` (@/ui/app/session-adapter.ts, ENG-272), so a session created here appears in the Dashboard list and is readable by Export. Env-based real-adapter selection is composition-root wiring (ENG-247), out of scope here; the defaults are production-only and intentionally untested (tests inject the ports).

### Known follow-ups

- `projectId` defaults to `'projeto'`; the real project comes from auth once the composition root exists (ENG-247).

### Things to Know

- **Layout realigned to the Protótipo** (`docs/design/Colar de Sons - Protótipo.dc.html`, CLAUDE.md precedence rule 2): a single centered 640px column (`.cds-setup > *`) instead of the previous two-column layout, headed by an eyebrow ("Preparação", `setup.eyebrow`) above the title, a large `ShemaIcon` watermark in the corner, and white cards (radius 15px, `--cds-shadow-card`) for the doors/levels/audio picker. The content and gating (§O7 trust line, consent checkbox, the three entry doors) are unchanged — only the visual frame moved.
