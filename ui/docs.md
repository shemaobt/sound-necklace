# Noridoc: ui

Path: @/ui

### Overview

- The Shemá design system plus the flow stations (Setup, Escutas, Triagem, Segmentação, Mapeamento, Export, Dashboard, Login), organized by **atomic design**: `tokens → atoms → molecules → organisms → templates/pages`, with `app` as composition root and `state` as the domain-state bridge.
- Present so far: @/ui/tokens (Shemá tokens) and @/ui/atoms (the presentational base layer — see @/ui/atoms/docs.md); @/ui/app/App.tsx is a placeholder replaced by the real shell in ENG-224 (routes, "fio de contas" stepper, itinerant player, review/lock, connection gate), plus a browser-mode smoke test proving the real-Chromium test pipeline.
- Design/copy source: the Claude Design prototypes win for look/layout/motion (@/docs/PRD-redesign.md); styling is CSS custom properties + plain CSS scoped by one `.cds-<component>` class per component with `data-*` attribute selectors for variants/states (NOT CSS Modules, despite @/docs/architecture.md mentioning them — the `.cds-*` convention achieves the same isolation). Token values port 1:1 from the prototypes and are unit-testable.

### How it fits into the larger codebase

- Outermost layer. The purity ladder is enforced by @/.dependency-cruiser.cjs, not convention:

| Sublayer                    | May import                                                      |
| --------------------------- | --------------------------------------------------------------- |
| `atoms`, `molecules`        | nothing from domain/contracts/adapters — props in, events out   |
| `organisms`                 | @/domain types (props/hooks contract); never adapters           |
| `state`                     | @/domain; never adapters (autosave arrives as an injected port) |
| `pages`, `templates`, `app` | everything — the only adapter-wiring layer                      |

- @/ui/app is the composition root and owner of the three **add-a-file registries** (@/docs/architecture.md §4): stations via `import.meta.glob('/ui/pages/*/index.tsx')` (a missing station renders a quiet "estação em construção" fallback), adapter registrations from @/adapters, and app addons via `/ui/app/addons/*.tsx` (overlay chrome such as the tutorial popup). Created once, never edited again — later issues only add files.
- App entry chain: @/index.html → @/ui/app/main.tsx → @/ui/app/App.tsx. Session state lives in Zustand stores under `state`; domain decisions themselves stay in @/domain.

### Core Implementation

- **Necklace performance pattern** (@/docs/architecture.md §6): beads render as React-managed DOM (structure changes are rare), but 60 fps playback lighting is driven **imperatively** — one `requestAnimationFrame` loop toggling classes/CSS variables through refs, one delegated pointer handler on the container with `data-index` lookup. Per-frame updates never pass through React state. The organism only maps pointer → bead index and calls back; selection decisions belong to the domain.
- **Test split by file suffix** (@/vitest.config.ts): `*.test.tsx` runs in the jsdom `dom` project; `*.browser.test.tsx` runs in real Chromium (`browser` project, `pnpm test:browser`). jsdom has no Web Audio, no MediaRecorder, and zeroed layout — so the interaction-critical organisms (necklace, seam modal, conversation recorder) **must** be tested in the browser project. The smoke test at @/ui/browser-smoke.browser.test.tsx proves the pipeline.
- Upgrade-in-place convention inside components: read `variants/*` and prefer the richer variant when the file exists (e.g., the storyteller guide gains an animated variant by adding one file, editing none).
- **Component conventions set by @/ui/atoms** (follow them in molecules/organisms): one directory per component with colocated CSS + tests; variants/states as `data-*` attributes; per-instance values via `--cds-*` custom properties (typed by @/ui/atoms/cds-css-props.d.ts); decorative motion only inside `@media (prefers-reduced-motion: no-preference)`, asserted in tests via `?raw` CSS import; non-tokenized shades via `color-mix()` over tokens, never new hex; consumers import from each layer's barrel, siblings by direct path (never the barrel — avoids cycles).

### Things to Know

- **All UI copy is PT-BR**; quoted strings in the PRDs are contract-level copy — reuse them verbatim.
- Listener-facing screens: max ONE short instruction line, one dominant action, **no counters/numbers/IDs/tables**; audio responds before text (bead click plays the bead; edge nudge plays ~1 s around the boundary). Facilitator surfaces (dashboard, coverage drawer, setup) may be denser.
- Never punish: errors guide, warnings allow a second-click proceed, border-crossing offers choices. Respect `prefers-reduced-motion`, visible focus outlines, header sound toggle.
- No numeric coverage threshold for `ui/` — instead, interaction tests are **mandatory** for the interaction-critical organisms; snapshot-only tests are not acceptable for atoms/molecules either (state-coverage tests required).
- `ui/` PRs may merge autonomously when tests pass. Sacrifice order if time runs out: tutorial popup → animated guide (static figure acceptable) → TTS → audit-log UI.
- Zustand 5 trap: selectors returning fresh references need `useShallow`.
- Never add telemetry/analytics on listener behavior; no AI-generated content inside the app.

Created and maintained by Nori.
