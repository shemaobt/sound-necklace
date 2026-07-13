# Noridoc: ui

Path: @/ui

### Overview

- The Shemá design system plus the flow stations (Setup, Escutas, Triagem, Segmentação, Mapeamento, Export, Dashboard, Login), organized by **atomic design**: `tokens → atoms → molecules → organisms → templates/pages`, with `app` as composition root and `state` as the domain-state bridge.
- Present so far: @/ui/tokens (Shemá tokens), @/ui/atoms (the presentational base layer — see @/ui/atoms/docs.md), @/ui/molecules (reusable atom compositions — see @/ui/molecules/docs.md) and @/ui/organisms (the stateful, interaction-critical compositions — see @/ui/organisms/docs.md), home of the hero necklace, the conversation stage, the seam modal (the border-crossing dialog), the shell-mounted tutorial popup, the Triagem picker and the coverage drawer — the dialogs/popup follow the repo's Radix policy (Radix primitives for behavior only, visuals 100% Shemá tokens). @/ui/app is now the **real composition-root shell** (ENG-224 — see @/ui/app/docs.md): History-API router, "fio de contas" stepper, the single itinerant player, review/lock chrome, the online-only connection gate, and the three add-a-file registries. @/ui/state is the **domain-state bridge** (see @/ui/state/docs.md). @/ui/pages holds the wired flow stations — the facilitator surfaces (Login, Dashboard, Setup) plus the session stations from the Escutas through Export — each documented in its own docs.md (e.g. @/ui/pages/escuta1/docs.md, @/ui/pages/dashboard/docs.md); a station enters the shell by adding its folder. Login and Dashboard are full-bleed: they own their header and the shell suppresses its own (see @/ui/app/docs.md).
- Design/copy source: the Claude Design prototypes win for look/layout/motion (@/docs/PRD-redesign.md); styling is CSS custom properties + plain CSS scoped by one `.cds-<component>` class per component with `data-*` attribute selectors for variants/states (NOT CSS Modules, despite @/docs/architecture.md mentioning them — the `.cds-*` convention achieves the same isolation). Token values port 1:1 from the prototypes and are unit-testable.

### How it fits into the larger codebase

- Outermost layer. The purity ladder is enforced by @/.dependency-cruiser.cjs, not convention:

| Sublayer                    | May import                                                      |
| --------------------------- | --------------------------------------------------------------- |
| `atoms`, `molecules`        | nothing from domain/contracts/adapters — props in, events out   |
| `organisms`                 | @/domain types (props/hooks contract); never adapters           |
| `state`                     | @/domain; never adapters (autosave arrives as an injected port) |
| `pages`, `templates`, `app` | everything — the only adapter-wiring layer                      |

- @/ui/app is the composition root and owner of the three **add-a-file registries** (@/docs/architecture.md §4): stations via `import.meta.glob('/ui/pages/*/index.tsx')` (a missing station renders a quiet "estação em construção" fallback), adapter registrations from @/adapters, and app addons via `/ui/app/addons/*.tsx` (overlay chrome such as the tutorial popup). Created once, never edited again — later issues only add files. It also owns the router, the fio-de-contas stepper, the single itinerant player, and the review/lock + connection chrome (see @/ui/app/docs.md).
- App entry chain: @/index.html → @/ui/app/main.tsx (loads token side-effects once) → @/ui/app/App.tsx. Session state lives in the Zustand stores under @/ui/state (the domain-state bridge — see @/ui/state/docs.md), which layer the review/lock/online editability gates over the pure @/domain state; domain decisions themselves stay in @/domain. The shell subscribes the @/adapters/connectivity port and feeds online state into both @/ui/organisms/connection-gate and the session store.

### Core Implementation

- **Necklace performance pattern** (@/docs/architecture.md §6, now realized in @/ui/organisms/necklace): beads render as React-managed DOM (structure changes are rare), but 60 fps playback lighting is driven **imperatively** — the bead field is a `React.memo` that excludes `playbackHead`, and a `useLayoutEffect` toggles a `data-play` attribute through the container ref so head changes never re-render bead elements. A single delegated pointer listener is attached natively via `addEventListener` (not React `onPointerDown`); pointer → bead is pure geometry, and a ref-mirror written in a layout effect lets the once-mounted listener read current props. The organism only maps pointer → bead index and calls back; selection decisions belong to @/domain/selection.ts. Layout math is a pure port in @/ui/organisms/necklace/geometry.ts (reference `renderCord`/`drawBand`/`beadAtXY`).
- **Test split by file suffix** (@/vitest.config.ts): `*.test.tsx` runs in the jsdom `dom` project; `*.browser.test.tsx` runs in real Chromium (`browser` project, `pnpm test:browser`). jsdom has no Web Audio, no MediaRecorder, and zeroed layout — so the interaction-critical organisms (necklace, seam modal, conversation recorder) **must** be tested in the browser project. The smoke test at @/ui/browser-smoke.browser.test.tsx proves the pipeline.
- Upgrade-in-place convention inside components: read `variants/*` and prefer the richer variant when the file exists (e.g., the storyteller guide gains an animated variant by adding one file, editing none).
- **Component conventions set by @/ui/atoms and continued in @/ui/molecules**: one directory per component with colocated CSS + tests; variants/states as `data-*` attributes; per-instance values via `--cds-*` custom properties (typed by @/ui/atoms/cds-css-props.d.ts); decorative motion only inside `@media (prefers-reduced-motion: no-preference)`, asserted in tests via `?raw` CSS import; non-tokenized shades via `color-mix()` over tokens, never new hex; consumers import from each layer's barrel, siblings by direct path (never the barrel — avoids cycles). Molecules add the ARIA structure atoms lack (radiogroups, grouped chips, the `<ol>`/`<li>` stepper) and inline any new glyphs (lock, notebook, download) as per-component Feather-stroke SVGs.
- **`@radix-ui/*` (scoped packages) is the only component library in the repo**, introduced by the seam modal (`@radix-ui/react-dialog`, ENG-228), reused by the coverage drawer and extended by the tutorial popup (`@radix-ui/react-popover`, ENG-231). It is used headlessly for behavior/ARIA primitives (dialog/sheet/popover patterns); styling stays the `.cds-*` plain-CSS convention, and any Radix open/close animation must live under the `prefers-reduced-motion: no-preference` guard (without it Radix unmounts instantly — the correct base behavior). See @/ui/organisms/docs.md for the conventions it set.

### Things to Know

- **All UI copy is PT-BR**; quoted strings in the PRDs are contract-level copy — reuse them verbatim.
- Listener-facing screens: max ONE short instruction line, one dominant action, **no counters/numbers/IDs/tables**; audio responds before text (bead click plays the bead; edge nudge plays ~1 s around the boundary). Facilitator surfaces (dashboard, coverage drawer, setup) may be denser.
- Never punish: errors guide, warnings allow a second-click proceed, border-crossing offers choices. Respect `prefers-reduced-motion`, visible focus outlines, header sound toggle.
- No numeric coverage threshold for `ui/` — instead, interaction tests are **mandatory** for the interaction-critical organisms; snapshot-only tests are not acceptable for atoms/molecules either (state-coverage tests required).
- `ui/` PRs may merge autonomously when tests pass. Sacrifice order if time runs out: tutorial popup → animated guide (static figure acceptable) → TTS → audit-log UI.
- Zustand 5 trap: selectors returning fresh references need `useShallow`.
- Never add telemetry/analytics on listener behavior; no AI-generated content inside the app.

Created and maintained by Nori.
