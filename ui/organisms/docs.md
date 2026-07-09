# Noridoc: ui/organisms

Path: @/ui/organisms

### Overview

- The third presentational layer of the Shemá design system: stateful compositions that consume @/domain state via props/hooks and own the interaction-critical surfaces the listener touches. The first organism is the **necklace** (`ui/organisms/necklace`, ENG-220) — the hero "colar" (redesign §6) that renders the whole story as a wrapped field of beads.
- The necklace renders the full bead-state vocabulary (palette-tinted segment beads, square end beads for locked scene ends, a soft selection band with emphasized edge beads, a dim + dashed scene-band over the active-scene window in Segmentação) and drives its own click model, hover-edge preview and 60 fps playback lighting.
- Unlike @/ui/atoms and @/ui/molecules, organisms are allowed to import @/domain **types** and hold interaction state; they still never import adapters.

### How it fits into the larger codebase

- Sits between @/ui/molecules and the wiring layers (@/ui/pages, @/ui/templates, @/ui/app). Consumers import from the public barrel @/ui/organisms/index.ts; sibling organisms import each other by direct path (never the barrel) to avoid cycles — the same rule atoms and molecules follow.
- The dependency direction is enforced mechanically by @/.dependency-cruiser.cjs, not convention: organisms may import @/domain (types only), @/ui/tokens (`PaletteEntry`) and the @/ui/atoms / @/ui/molecules barrels; the ban on adapter imports is a required CI check.
- **Selection decisions stay in the domain.** The necklace reports a raw bead index through callbacks (`onBeadPointerDown`, `onEdgeHover`, `onHeadTap`) and never decides what a click means — the click model that turns a bead into a selection lives in @/domain/selection.ts. The organism is the pointer-to-index transducer plus the renderer; the page wires the domain decision back in as new props.
- `Span` (the `{ s, e }` bead range) is the shared coordinate between this organism and @/domain — segments, selection, the active-scene window and locked-end beads all arrive as bead indices, matching the "bead indices are the universal coordinate" invariant in @/domain.

```
ui/tokens ──▶ ui/atoms ──▶ ui/molecules ──▶ ui/organisms ──▶ templates/pages/app
(PaletteEntry) (Pearl…)     (rows, bands)    (this folder:     (adapter wiring +
                                             necklace)          domain decisions)
```

### Core Implementation

- **Geometry is a pure port** in @/ui/organisms/necklace/geometry.ts — a 1:1 translation of the reference `renderCord`/`drawBand`/`beadAtXY` (see @/docs/reference/index.html). It has zero DOM/framework imports: `resolveWindow` (active scene ± `max(3, round(2/beadSec))` margin, or the whole story when no scene is active), `beadsPerRow` (from container width), `beadPosition` (absolute left/top of a bead), `beadAtXY` (pointer coords → clamped bead index), and `bandRects` (one rectangle per row when a band wraps across the row break). The pure math is unit-tested independently of the component.
- **Imperative island for playback lighting** (@/docs/architecture.md §6): the bead field is a `React.memo` component that receives ONLY structural props — `playbackHead` is deliberately excluded, so feeding a new head does NOT re-render bead elements. A `useLayoutEffect` toggles a `data-play` attribute (`played`/`head`) on bead wrappers via the container ref. DOM node identity stays stable across head changes, so per-frame updates never pass through React state or reconciliation.
- **One delegated native pointer handler**: a single `pointerdown`/`pointermove`/`pointerleave` listener is attached with `addEventListener` on the container inside a mount-once `useLayoutEffect` (NOT React's `onPointerDown`, which delegates at the document root). Pointer → bead is pure geometry (`beadAtXY` over `getBoundingClientRect`), clamped to the render window.
- **Ref-mirror for live props**: because the listeners mount once, they read the latest props through `ixRef`, written inside a layout effect (NOT during render — the `react-hooks/refs` rule forbids ref mutation in render). This keeps the handlers current without re-attaching them.
- **Head-tap precedence** (redesign §6.2, "the glowing head pauses"): when the tapped bead equals the glowing `playbackHead`, `onHeadTap` fires instead of `onBeadPointerDown`.
- The `window` prop is the ACTIVE SCENE span; the organism derives the render window internally, dims the margin beads (`state='dim'`) and draws the dashed scene-band over the scene. `transportOnly` (Escuta/review) suppresses all selection affordances.

### Things to Know

- @/ui/organisms/necklace/minimalism.test.tsx is the layer-level guard for PRD v2 §9.2 listener minimalism, mirroring the atoms/molecules guards: the rendered necklace may show no digit as visible text, `aria-label` or `title`. IDs and counters never appear on this listener-facing surface.
- **Test split by file suffix** (@/vitest.config.ts): `*.test.tsx` runs in jsdom (`necklace.test.tsx` asserts the render vocabulary; `geometry.test.ts` covers the pure math), while `*.browser.test.tsx` runs in real Chromium — required here because jsdom has zeroed layout and no real hit-testing. There is **no `vitest-browser-react`** in the repo: browser tests drive the component with raw `createRoot`/`flushSync` and native `dispatchEvent(new PointerEvent(...))` for coordinate hit-testing.
- The 280 ms hover-edge dwell (a single edge preview fires only after the pointer rests near a selection edge) is tested with `vi.useFakeTimers()` + `advanceTimersByTimeAsync`; the single-listener claim is verified by spying on `addEventListener`. Touch pointers skip hover entirely.
- `ResizeObserver` is feature-detected — absent in jsdom, where the one synchronous width measure suffices; in the browser it re-measures on resize.
- Pearl (@/ui/atoms) stays non-clickable: the organism owns all pointer handling, matching the necklace performance pattern described in @/ui/docs.md. The scene-end square, dim margin and selection edge-ring are all Pearl `data-*` states driven from `computeField`.

Created and maintained by Nori.
