# Noridoc: ui/molecules

Path: @/ui/molecules

### Overview

- The second presentational layer of the Shemá design system (ENG-218): reusable compositions of @/ui/atoms — a bead row over a cord, the pending selection band, the saved scene/phrase chip, the confidence-trio gesture, the scene-kind card, the Conversation question card, the Export document card, the "fio de contas" stepper station, Triage progress dots, the Setup trust chip, the autosave save-chip and the conversation per-trecho progress bar.
- The second presentational layer of the Shemá design system (ENG-218): reusable compositions of @/ui/atoms — a bead row over a cord, the pending selection band, the saved scene/phrase chip, the confidence-trio gesture, the scene-kind card, the Conversation question card, the Export document card, the "fio de contas" stepper station, Triage progress dots, the Setup trust chip and the conversation per-trecho progress bar.
- Every molecule stays purely presentational: props in, events out, no domain/contracts/adapters imports. It composes atoms and adds only layout plus the ARIA structure that turns loose atoms into a coherent widget.
- Visual/interaction source of truth is the Claude Design prototypes and @/docs/PRD-redesign.md (each molecule's doc-comment cites the exact § — e.g. selection band §4.3, confidence trio §4.4/§6.4, stepper §5.1); token values come from @/ui/tokens.

### How it fits into the larger codebase

- Sits between @/ui/atoms and @/ui/organisms (see @/ui/organisms/docs.md for the organisms that compose these pieces). Consumers (organisms, then pages) import from the public barrel @/ui/molecules/index.ts; sibling molecules would import each other by direct path (never the barrel) to avoid cycles — the same rule atoms follow.
- Molecules import ONLY @/ui/atoms (via its barrel), @/ui/tokens (for `PaletteEntry`) and React. The ban on domain/contracts/adapters is enforced mechanically by @/.dependency-cruiser.cjs rule `atomos-e-moleculas-puros` (path `^ui/(atoms|molecules)`), not by convention.
- Molecules carry no domain meaning. They emit **presentational tokens**, not domain enums: ConfidenceTrio yields `'certeza' | 'quase' | 'duvida'` and the calling organism maps those to the domain's `alta`/`média`/`baixa` (the map lives in @/ui/organisms/triage-picker). Bead/scene geometry (how many beads land on each row, which are edge beads) is computed above by the necklace organism and handed in as props.
- Feeds the interaction-critical organisms that compose these pieces — e.g. the necklace (BeadRow + SelectionBand), the Triage picker (KindCard + ConfidenceTrio) and the conversation stage (QuestionCard) — plus the dashboard (ENG-222) and the app shell (StepperStation); see @/ui/organisms/docs.md and @/ui/docs.md for the layers above. (Not every organism needs a molecule: the seam modal composes atoms directly.)

```
ui/tokens ──▶ ui/atoms ──▶ ui/molecules ──▶ ui/organisms ──▶ templates/pages/app
(CSS vars,    (pearl,       (this folder:     (necklace,        (adapter
 PaletteEntry) cord, disc…)  rows, cards,      Triage, seam…)   wiring)
                             chips, stepper)
```

### Core Implementation

- **One directory per molecule** with colocated component + plain CSS + test, mirroring @/ui/atoms: one `.cds-<name>` scoping class, variants/states as `data-*` attribute selectors, per-instance values via `--cds-*` custom properties (typed by the global @/ui/atoms/cds-css-props.d.ts — molecules add no new augmentation), decorative motion only inside `@media (prefers-reduced-motion: no-preference)`, non-tokenized shades via `color-mix()` over tokens. QuestionCard renders its quiet-voice text with `var(--cds-font-quiet-voice)`.
- **Accessibility structure is the molecule's job** and follows ARIA APG / WCAG:
  - Single-select gestures are `radiogroup`/`radio` with `aria-checked` (not toggle buttons): ConfidenceTrio owns a full roving-tabindex group (one tab stop, arrow/Home/End move-and-select); KindCard is an isolated `role="radio"` whose group and roving tabindex are orchestrated by the Triage picker organism — KindCard forwards no ref, so the organism roves focus by querying `[role="radio"]` on its container (see @/ui/organisms/docs.md).
  - ScenePhraseChip is a non-interactive `role="group"` holding sibling buttons (▶ play plus an `actions` slot for Reabrir/⚑/✕) — it never nests interactives inside an interactive (WCAG 4.1.2).
  - StepperStation is an `<li>` with `aria-current="step"` + sr-only state text — a progress indicator, not navigation, so no `<nav>` and no focusable element; the organism wraps stations in a named `<ol>`. ProgressDots are named `<button>`s with the current one `aria-current="step"`.
- **Two molecules were realigned to the Protótipo** (`docs/design/Colar de Sons - Protótipo.dc.html`, CLAUDE.md precedence rule 2):
  - `StepperStation` renders a rounded rectangle bar (7px tall, `border-radius` 4px), not a pearl/dot — realigned to the `docs/design/novos componentes.html` "Progresso geral · as etapas" card (ENG-353). Done/current bars are filled telha accent (`#E8813E`); the current one is wider (30px vs 18px) and carries a `--cds-chrome-halo` box-shadow; future bars are hollow (`--cds-chrome-dot-future-bg` + border, the border kept for visibility in the light chrome the dark-only mockup didn't cover). Colors come from the `--cds-chrome-*` variables so the bar adapts to the light/dark header context; the width/halo transition sits under the `prefers-reduced-motion` guard. The visible station NAME lives in @/ui/app/stepper.tsx (rendered once above the `<ol>` for the CURRENT station only); the sr-only label here is unchanged.
  - `ProgressDots` gained an optional `scenes: ProgressDotScene[]` prop (`{ state: 'tagged' | 'none_fit' | 'pending', tint? }`) so the Triage station (@/ui/pages/triage) can render each dot as: a scene-tinted pearl with a white check (`tagged`), the same tint desaturated with no check (`none_fit`), or a hollow ring (`pending`, the default when `scenes` is omitted). The check is an inline SVG, not a glyph component.
  - `KindCard` no longer renders an @/ui/atoms `Pearl` for its tint swatch — it inlines a flat 10px `<span>` dot (`background: tint.base`, no gradient) and, new for the none-fit variant, an `ø` glyph replacing the swatch position.
- **New glyphs are inlined per-molecule** as Feather-stroke SVGs (`viewBox="0 0 24 24"`, `aria-hidden`, `focusable="false"`, `stroke="currentColor"`): lock (TrustChip), notebook role-marker (QuestionCard, wrapped in `role="img"`+`aria-label`), download arrow (DocumentCard). No shared glyph component exists in-repo yet, so each molecule ships its own. Play/pause reuses the @/ui/atoms PlayGlyph.
- **State via props, effects via slots.** DocumentCard toggles Baixar→baixado through a `downloaded` prop (`data-downloaded`); the actual Blob/anchor download is the caller's. QuestionCard exposes an answer slot (`children`) for the recorder/waveform; ScenePhraseChip exposes an `actions` slot. Molecules never own IO.

### Things to Know

- @/ui/molecules/minimalism.test.tsx is the layer-level guard for PRD v2 §9.2 (oral-culture minimalism), mirroring @/ui/atoms/minimalism.test.tsx: rendered with digit-free copy, no molecule may show a digit as visible text, `aria-label` or `title`. Numeric labels ("Cena 1", "P3") are the **caller's** responsibility — the molecule never injects a digit on its own. Any new molecule must be added to this test.
- Tests assert the public contract only — query by role + accessible name, assert state via role filters (`{ checked }` / `{ current }`) or `getAttribute`, and verify callbacks with `vi.fn()` payloads. No snapshots (snapshot-only tests are not acceptable coverage here).
- SelectionBand renders **one band segment per row**, so a pending range that wraps across rows produces multiple segments; it flags only the first and last bead of the _whole_ range (global index 0 and total−1) as `data-edge` (the telha ring), computing per-row offsets with a pure prefix sum.
- KindCard shows the display label its caller passes (PT or EN, resolved by `sceneKindLabel` in @/ui/i18n) as visible text and keeps the English `scene_kind` value in the `title` — the contract value, never translated. Its none-fit variant is the dashed, colorless "Nenhum se encaixa" card.
- **Molecules never call `useTranslation`** (that would break the purely-presentational rule): translated copy arrives as props from an organism or page. Their prop DEFAULTS, however, are still hardcoded PT-BR (the ConfidenceTrio disc/group labels, the DocumentCard download labels, the ProgressDots names, the QuestionCard role title) — an un-overridden default renders PT even with the UI in EN. Translating a molecule = giving the caller a prop, not importing the dictionary here. See @/ui/i18n/docs.md.

Created and maintained by Nori.
