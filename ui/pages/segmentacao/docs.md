# Noridoc: segmentacao

Path: @/ui/pages/segmentacao

### Overview

- The phrase station (ENG-237): "Segmentação — as frases dentro de uma cena" (PRD v2 §8.6, redesign §6.5). Work happens **one productive scene at a time**: the necklace windows down to the active scene ± a margin, the listener anchors phrases inside it, and border-crossings open the visual seam modal instead of blocking.
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders the @/ui/organisms `Necklace` (windowed) and `SeamModal`, and dispatches the phrase/seam domain reducers.
- Cream working stage with the "Cena N · <tipo>" title, exactly one instruction line, and exactly one dominant action ("✓ Confirmar esta frase"), per the listener-facing UI rules (§9.2).

### How it fits into the larger codebase

- **The station after Triagem.** Stations self-register through the `import.meta.glob('/ui/pages/*/index.tsx')` registry built in @/ui/app/registries.ts, so the default export in `index.tsx` is mandatory — it is the registry value, keyed by the directory name `segmentacao`. @/ui/app/App.tsx's `KEY_TO_MODE` maps `segmentacao` to the domain `segmentacao` mode; the app shell renders this station when the session mode is `segmentacao`.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import @/domain, @/ui/state, @/ui/organisms, @/ui/molecules, @/ui/atoms, @/ui/tokens and adapters. It also reuses three pure helpers from the sibling station @/ui/pages/escuta2 (`playActionOn`, `sceneColor`, `sceneLabel`) — same anchoring ceremony, no duplicated cardinal.
- Reads session state via `useSessionStore` and writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause an anchor/move/reopen without losing in-memory state.
- Advancing dispatches `confirmFrasesDone` (@/domain/phrases.ts), which — after the empty-scene soft warning — either enters the next productive scene or moves the guided flow to Mapeamento (`mode='mapeamento'`).
- The itinerant `Player` (@/ui/app/player-slot.tsx, @/adapters/audio) is injected by prop, not constructed here — see the audio seam below.

### Core Implementation

- **`Segmentacao({ player })`** (@/ui/pages/segmentacao/index.tsx): subscribes `session` from the store; renders `null` until a session with an active productive scene exists. A single `useMemo` keyed on `session` derives the active scene (`activeScene`), its span, the scene's locked phrases (with their global index), and the necklace's `segments`/`lockedEndBeads` — one memo so per-frame `playbackHead` updates never recompute the field (the necklace's no-rerender imperative lighting).
- **Windowed necklace** — the `window` prop is the active scene span; the organism draws the dashed awake band and dims/omits beads outside scene ± `max(3, round(2/beadSec))` (the margin lives in `resolveWindow`). Locked phrases tint the cord via `phraseColor` (cycles `phrasePalette`); their end beads render square.
- **Click model** delegates to the pure domain reducer `clickBead` (@/domain/selection.ts): `onBeadPointerDown` reads the freshest session via `sessionStore.getState()`, applies the returned state, then plays the `PlayAction` via `playActionOn`. Edge hover calls `player.playEdge`.
- **Confirm this phrase** — the dominant action (`data-role="primary-action"`) dispatches `confirmFrase(state, current.index)`, whose result is a discriminated union: `error` (shows the domain copy), `border` (opens the seam modal with the offer), `locked` (applies the new state), `noop`. It renders while `activeAnchor(session)` exists (always true while phrasing a scene).
- **Seam modal** (@/ui/organisms `SeamModal`): fed the domain `BorderOffer` plus the scene and the immediate neighbor of the crossing side (`nextNeighbor`/`prevNeighbor`, tinted by `sceneColor`). `Mover a borda até aqui` → `moveBorder(state, offer)` (slides the shared seam, then locks); `Reancorar dentro da cena` → `reanchorFrase` (clears the selection); `Voltar à Triagem` → `setMode('triagem')`. Move runs against the same store state that produced the offer (unchanged while the modal is open).
- **Locked phrases** render as `ScenePhraseChip` (swatch · "Frase N" · ▶ ouvir · Reabrir · ⚑ revisar · Remover), dispatching `reopenFrase` / `toggleFlag` / `removeFrase` by the phrase's global index. `phraseLabel` reuses escuta2's tested cardinal ("Cena N" → "Frase N") so the screen stays digit-free.

### Things to Know

- **Primary button** reads "Pronto com esta cena →", or "Já segmentei todas as cenas →" on the last productive scene (`sceneIndexOf` vs `productiveScenes.length`); it dispatches `confirmFrasesDone`.
- **Empty-scene soft warning:** leaving a scene with zero locked phrases surfaces "Esta cena ficou sem frases. Clique de novo para seguir mesmo assim." once (the `warnedEmptyScene` marker is UI-local state); a second click proceeds. Reference-faithful.
- **"← Voltar"** goes to the previous productive scene (`enterScene`), or to Triagem from the first (`setMode('triagem')`) — a port of the reference's `frasesBack`.
- All validation copy comes verbatim from `FRASE_ERROR_COPY` / `FRASES_EMPTY_WARNING` (@/domain/phrases.ts) — never re-authored in the UI; shown in a `role="alert"` line. The only digit any listener sees is the facilitator bead number interpolated into the "phrase starts before bead X" message (§9.2 carve-out). Being domain copy, all of it stays **PT-BR under an EN UI**; the station's own copy and the seam modal translate (@/ui/i18n).
- **The audio seam is the extension point.** `player` defaults to `null`; with no player the click model computes state but skips playback, and no engine is constructed here. Extend audio through this prop.
- Chip-entry motion (@/ui/pages/segmentacao/segmentacao.css) is guarded by `@media (prefers-reduced-motion: no-preference)`; bead lighting motion lives in the atoms, already guarded there.
- Tests split by suffix: `wiring.test.ts` and `segmentacao.test.tsx` run in jsdom; `segmentacao.browser.test.tsx` runs in real Chromium for the coordinate click model against real windowed necklace geometry (jsdom has zeroed layout).

Created and maintained by Nori.
