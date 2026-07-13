# Noridoc: escuta2

Path: @/ui/pages/escuta2

### Overview

- The second flow station (ENG-230): "Escuta 2 — o corte de cenas" (PRD v2 §8.4, redesign §6.3), where the listener cuts the confirmed whole story into scenes by tapping only where **each scene ends** — the start of every scene comes pre-anchored at the previous seam by the domain.
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders the @/ui/organisms `Necklace` with anchoring active, and dispatches the scene-cut/confirm/reopen domain reducers.
- Cream working stage with exactly one instruction line ("Toque no colar onde **esta cena termina**") and exactly one dominant action ("✓ Confirmar esta cena"), per the listener-facing UI rules (§9.2).

### How it fits into the larger codebase

- **The station after @/ui/pages/escuta1.** Stations self-register through the `import.meta.glob('/ui/pages/*/index.tsx')` registry built in @/ui/app/registries.ts, so the default export in `index.tsx` is mandatory — it is the registry value, keyed by the directory name `escuta2`. @/ui/app/App.tsx's `KEY_TO_MODE` maps `escuta2` to the domain `escuta` mode; the app shell renders this station (rather than escuta1) when the session mode is `escuta` **and** `whole.confirmed` is true — the split lives in @/ui/app/stepper-model.ts `currentIndex`.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import adapters, @/domain, @/ui/state, @/ui/organisms, @/ui/molecules, @/ui/atoms and @/ui/tokens — the only place besides @/ui/app and templates allowed to reach adapters.
- Reads session state via `useSessionStore` and writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause a cut/confirm/reopen without losing in-memory state.
- Advancing dispatches `confirmParts` (@/domain/scenes.ts), which drops the trailing unlocked scene, sets `partsConfirmed`, and moves the guided flow to Triagem (`mode='triagem'`) — so this station is the hand-off from raw listening into scene classification.
- The itinerant `Player` (@/ui/app/player-slot.tsx, @/adapters/audio) is injected by prop, not constructed here — see the audio seam below.

### Core Implementation

- **`Escuta2({ player })`** (@/ui/pages/escuta2/index.tsx): subscribes `session` from the store; renders `null` until a session exists. Local React state holds only the `playbackHead` (mirrored from the player via `player.onHead`) and the last domain error string.
- **Anchoring necklace** — unlike escuta1's transport-only colar, the necklace runs with anchoring active. Structural props (`segments` = locked parts as `{span, tint}`, `lockedEndBeads` = square end beads) are `useMemo`'d on `session.parts` so per-frame `playbackHead` updates never recompute them, preserving the necklace's no-rerender imperative lighting.
- **Click model** delegates to the pure domain reducer `clickBead` (@/domain/selection.ts): `onBeadPointerDown` reads the freshest session via `sessionStore.getState()`, computes `{state, play}`, applies the state through `sessionStore.apply`, then plays the returned `PlayAction` via `playActionOn`. Edge hover calls `player.playEdge` directly.
- **`playActionOn` / `sceneLabel` / `sceneColor`** (@/ui/pages/escuta2/cutting.ts): `playActionOn` interprets the reducer's effect-as-value `PlayAction` (single-bead/range → `player.play(s,e)`; edge → `player.playEdge`; transport → the bead itself); `sceneLabel` renders "Cena <ordinal-por-extenso>" (um/dois/… up to 99, then bare "Cena") so the screen stays digit-free; `sceneColor` cycles the terracotta `scenePalette` (@/ui/tokens) by part index.
- **Confirm this scene** — the dominant action (`data-role="primary-action"`, exactly one) dispatches `confirmPart(state, current.index)`: it locks the span, squares the end bead, and auto-opens the next scene pre-anchored at the seam (frontier+1). It renders only while `activeAnchor(session)` exists (always true during escuta2).
- **Confirmed scenes** render as `ScenePhraseChip` (swatch · label · ▶ ouvir · Reabrir) in a wrapping row; `Reabrir` dispatches `reopenPart(state, i)`, which unlocks scene _i_ and everything after it (frontier-integrity cascade), reflected in the chip list.

### Things to Know

- **"Confirmar as cenas →"** (dark button) appears only when ≥1 scene is locked; it dispatches `confirmParts` and advances to Triagem, discarding the trailing unlocked scene.
- **"← Voltar"** returns to Escuta 1 preserving the cut scenes: it composes `setMode({ ...s, whole: { ...s.whole, confirmed: false } }, 'escuta')` — a faithful port of the reference's `cenasBack` handler (whole.confirmed=false; setMode('escuta')), distinct from escuta1's `reopenWhole`.
- The two confirm-scene error copies come verbatim from the domain contract `SCENE_ERROR_COPY` (`SELECTION_INCOMPLETE` and `SCENE_BEFORE_FRONTIER`, the latter carrying the frontier bead number) — never re-authored in the UI; shown in a `role="alert"` line. Being domain copy, they stay **PT-BR under an EN UI**, unlike the station's own instruction/button copy (@/ui/i18n).
- **The audio seam is the extension point.** `player` defaults to `null` (same seam as escuta1); with no player the click model computes state but skips playback, and no engine is constructed here. Extend audio through this prop.
- **Grid alignment invariant:** the injected player's grid (`beadSec` / decoded duration) must match the session grid (`totalBeads` / `beadSec`) threaded to the necklace, or bead-to-time mapping drifts.
- **Digit-free listener rule (§9.2):** scene chips use spelled ordinals from cutting.ts, not numerals; the necklace's internal `data-idx` bead numbers stay data attributes (not textContent/aria/title) so they don't violate the guard.
- Chip-entry motion (@/ui/pages/escuta2/escuta2.css) is guarded by `@media (prefers-reduced-motion: no-preference)`; bead lighting motion lives in the atoms, already guarded there.
- Tests split by suffix: `cutting.test.ts` and `escuta2.test.tsx` run in jsdom; `escuta2.browser.test.tsx` runs in real Chromium for the coordinate click model against real necklace geometry (jsdom has zeroed layout).

Created and maintained by Nori.
