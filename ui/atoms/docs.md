# Noridoc: ui/atoms

Path: @/ui/atoms

### Overview

- The lowest presentational layer of the Shemá design system: pearl/bead, cord line, chip, button, confidence disc, waveform bar and play glyph — the visual vocabulary every molecule and organism composes from (ENG-215, base of the atomic-design chain).
- Every atom is purely presentational: props in, events out. Visual states are exposed as `data-*` attributes; per-instance tinting/sizing travels through `--cds-*` CSS custom properties.
- Visual source of truth is the Claude Design prototypes in @/docs/design (the "Ouvir no colar" prototype is normative for pearl, cord and head-glow); token values come from @/ui/tokens.

### How it fits into the larger codebase

- Consumed by future @/ui molecules (ENG-218) and organisms; consumers import from the public barrel @/ui/atoms/index.ts. Siblings inside this folder import each other by direct path, never via the barrel, to avoid import cycles (e.g. Chip renders Pearl as its color swatch through a direct sibling import).
- Atoms import ONLY @/ui/tokens (for `PaletteEntry` and CSS variables) plus React. The ban on domain/contracts/adapters imports is enforced mechanically by @/.dependency-cruiser.cjs, not by convention.
- Atoms carry no domain meaning: Pearl does not know which bead index it is, WaveformBar does not sample audio (heights arrive as props; the molecule animates them), Chip does not know what a scene is. All domain decisions stay in @/domain, wired in far above at pages/templates/`ui/app`.
- The `PaletteEntry` shape (`base`/`lit`/`deep`) is defined in @/ui/tokens/tokens.ts; atoms consume whatever entry they receive and never derive palette values themselves.

```
ui/tokens ──▶ ui/atoms ──▶ ui/molecules ──▶ ui/organisms ──▶ templates/pages/app
(CSS vars,     (this        (rows, cards,    (necklace +
 PaletteEntry)  folder)      chips)          more planned)
```

### Core Implementation

- **One directory per atom** with colocated component, plain CSS file and test. Each atom owns exactly one scoping class (`.cds-<atom>`); variants and states are styled via `data-*` attribute selectors (Radix convention) — e.g. Pearl's `data-state` (unplayed/lit/head/dim), Button's `data-variant`/`data-size`, PlayGlyph's `data-state` play/pause. This is plain CSS, NOT CSS Modules; the unique `.cds-*` class per atom achieves the same isolation.
- **Tinting via custom properties:** Pearl accepts a `PaletteEntry` and sets `--cds-pearl-base/lit/deep` inline, with CSS fallbacks to the pérola-aveia tokens when untinted. WaveformBar and ConfidenceDisc size the same way (`--cds-bar-height`, `--cds-disc-size`). @/ui/atoms/cds-css-props.d.ts augments `React.CSSProperties` so `--cds-*` keys type-check without casts.
- **Accessibility split:** decorative atoms (Pearl, CordLine, WaveformBar, PlayGlyph) are `aria-hidden` — the interactive parent (a molecule's row or button) carries the accessible name. Interactive atoms are real `<button>`s: Chip renders `aria-pressed` (toggle semantics) only when the `selected` prop is explicitly passed — action-only chips omit the prop and stay plain buttons. ConfidenceDisc is dual-mode: with a `label` prop it renders `role="img"` + `aria-label`; without one it is `aria-hidden`.
- **Motion is opt-in:** decorative animations (Pearl head-glow, ping pulse) live exclusively inside `@media (prefers-reduced-motion: no-preference)` blocks in the CSS — users preferring reduced motion never receive them (redesign §4.5). Tests import the CSS with Vite's `?raw` suffix and assert the guard exists textually.
- **Color discipline:** non-tokenized shades are derived with `color-mix()` over token variables (never new hardcoded hex); shadow/ring `rgba()` values are copied verbatim from the prototypes because ink and glow were intentionally not tokenized.

### Things to Know

- @/ui/atoms/minimalism.test.tsx is a layer-level guard for PRD v2 §9.2 listener minimalism: rendered with normal props, no atom may show a digit — as visible text, `aria-label` or `title`. Any new atom must be added to this test and must pass it.
- Tests assert the public contract only (data attributes, aria semantics, custom properties, click pass-through) — no snapshots, per the repo rule that snapshot-only tests are not acceptable coverage for atoms.
- Pearl is never clickable itself; the bead row (a molecule) owns the pointer handling. This matches the necklace performance pattern in @/ui/docs.md where per-frame lighting is driven imperatively above the atom.
- Pearl's scene-end variant (`data-scene-end`) renders square-ish with a flat deep fill; Button's primary hover/active/focus-visible all darken to `--cds-telha-deep` — press darkens, never lightens (redesign §4.1). PlayGlyph is inline SVG (viewBox 24, `currentColor`), never a unicode character.
- Known divergence (recorded in @/RESEARCH-NOTES.md, not an atoms concern): the prototypes ship hand-tuned per-hue lit/deep tones, while @/ui/tokens froze `lit = base` and `deep = darken30(base)`. Atoms simply render whatever `PaletteEntry` they are handed, so a future tokens fix requires no atom change.
- All copy passed into atoms (labels, children) is PT-BR, supplied by callers; atoms themselves render no text of their own except what they receive.

Created and maintained by Nori.
