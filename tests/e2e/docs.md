# Noridoc: tests/e2e

Path: @/tests/e2e

### Overview

- **The acceptance layer (E6).** Playwright specs that drive the **real app in fixture mode** through the browser — login → Setup → the listener stations → Export/report/Dashboard — proving the end-to-end product criteria of @/docs/plano-de-acao-mvp.md §3 and @/docs/PRD-colar-de-sons-v2.md §9.
- Distinct from @/tests/golden: the golden harness proves `domain ≡ reference` by byte-diffing artifacts against the untouchable v1 reference; these specs prove the **assembled UI + adapters** deliver those artifacts and the ear-first behavior through actual DOM interaction.
- Runs as the CI job `e2e` (@/.github/workflows/ci.yml) via `pnpm e2e`. It is an **additional, non-required** check (CLAUDE.md quality gates) — the golden harness remains the only unrelaxable gate.

### How it fits into the larger codebase

- Exercises every outer layer at once through @/ui (pages/app wiring) → @/adapters in **fixture mode** → @/contracts → @/domain, with no real API/audio/network. The fixtures under @/fixtures (esp. the bucket audio's `PcmSpec`) are what let the app boot offline.
- Reads persisted session state straight from `localStorage` — the key belongs to `FixtureSessionBackend` (@/adapters/sessions) and the autosave path documented in @/docs/PRD-colar-de-sons-v2.md §7.3 — to assert zero-loss and completion status without trusting a self-reported flag.
- Depends on the audio Player wiring in @/ui/app: the fixture player's rAF-driven playhead lights `data-play` on `.cds-necklace-bead`, which the specs treat as the DOM-observable "sound" signal (see the ENG-275 note in @/CURRENT-PROGRESS.md).

### Core Implementation

```
playwright.config.ts ──webServer──> vite (SPA fallback, real app, fixture adapters)
        │ testDir tests/e2e, chromium headless, reducedMotion=reduce, workers=1
        ▼
  *.spec.ts ──imports──> support/  (ColarApp page object · SCENARIO · read* helpers)
```

- @/playwright.config.ts boots Vite as its `webServer` (SPA fallback so History-API routes resolve), pins a single Chromium worker, and forces `prefers-reduced-motion: reduce` so geometry-based bead clicks never race an animation. Vitest never sees these specs — they live outside its unit/dom/browser globs.
- @/tests/e2e/support (barrel @/tests/e2e/support/index.ts) is the shared driver, imported read-only by every spec:
  - `ColarApp` — a page object with one method per station step (login, createSession, cutScenes, triage, cutPhrase, moveSeam, answerConversation, completeSession, …). Every selector is verbatim PT-BR copy from the stations, so a copy change fails here at a single point instead of across specs.
  - `SCENARIO` — a deterministic decision script over the `conto-do-boto` fixture audio that mirrors the golden `seam-small-move` case (three scenes, one `none_fit`, a border-crossing phrase whose seam slides).
  - `readPersistedState` / `readPersistedStatus` — pull the autosaved session DTO / summary status out of `localStorage`.
- Each spec targets one acceptance criterion — the full listener cycle across sittings, artifact **byte-identity** through the UI (crosschecked against @/tests/golden `expected/`), Dashboard artifact retrieval, and the oral-mode behavior — composing `ColarApp` for the shared path and adding its own assertions.

### Things to Know

- **Byte-identity specs compare raw bytes** (`Buffer.equals`, PRD §10.5) between UI-triggered downloads and the committed golden artifacts; reproducing a golden case through the UI needs a bucket fixture whose `PcmSpec` yields the same `manifest_id` and bead grid, not `SCENARIO`.
- The oral-mode spec (@/tests/e2e/oral-mode.spec.ts) installs a DOM spy via `page.addInitScript` (`window.__oral`): a `MutationObserver` records ordered `sound` events (a bead gaining `data-play`) vs `text` events (new non-empty text outside `.cds-necklace`), and capture-phase click/focus listeners flag any interaction reaching chrome (`.cds-header`/`.cds-stepper`). It asserts sound-before-text at the DOM-observable ear-first decision points, that an edge-dwell nudge plays without changing the selection bands, zero chrome interaction across the listener path, and non-text signifiers (`aria-hidden` text-free beads, `data-role` on instruction/primary-action). Where playback is **not** DOM-observable (a selection-completing tap whose confirm renders before the playhead lights; Mapeamento, which has no necklace) the property is proven by the control's non-textual signal and in-station advance instead.
- Ear-first is enforced as an ordering invariant, not a timing one: assertions poll for the first `sound` event and only require `firstSound < firstText` when text appears at all.
- Support helpers walk the conversation by **detecting the question level** from the visible ▶ button rather than counting the exact `questionSequence` indices, so they stay robust as scene/phrase counts vary.

Created and maintained by Nori.
