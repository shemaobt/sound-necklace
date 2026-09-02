# Noridoc: review

Path: @/ui/pages/review

### Overview

- The fifth and last flow station (ENG-725, design source `docs/design/revisao-tela-nova.html`): "Rever" — the point where the facilitator and the listener see their own work together for the first time, before concluding. Both people see this screen, so PRD §9.2 applies in full: no digits, counters, ids or tables anywhere on it.
- Owner decisions shape everything here: it is a screen, not a drawer; nothing is ever edited — the station only shows and plays, errors are fixed at the originating station (@/ui/pages/cut, @/ui/pages/triage, @/ui/pages/phrases); "nenhum se encaixa" (none-fit) is treated as a valid answer, never as an error state.
- A wiring component: it reads the pure @/domain session through @/ui/state's session store, renders the whole necklace via @/ui/organisms `Necklace` in `transportOnly` mode plus a row of @/ui/molecules `ScenePearl`, and calls the shell back through `onBlockClosed('historia')` when the story is concluded. It never writes to `sessionStore` — this slice (ENG-725) does not mark the session concluded on the server either; that lands in ENG-702.

### How it fits into the larger codebase

- **The station after Frases.** Stations self-register through the `import.meta.glob('/ui/pages/*/index.tsx')` registry built in @/ui/app/registries.ts, keyed by the directory name `review`. @/ui/app/stepper-model.ts maps the domain's terminal mode `concluida` to this station's index — @/domain has no gate key for it (`modeLocks` stops at `segmentacao`), reachability is the mode itself.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import @/domain, @/ui/state, @/ui/organisms, @/ui/molecules, @/ui/atoms, @/ui/tokens and adapters.
- Reads session state via `useSessionStore`; unlike every other station it dispatches no domain reducer at all — there is nothing here for the store's editability gates (online/review/lock) to pause.
- @/ui/pages/phrases's `confirmFrasesDone` returning `kind: 'finished'` no longer closes a block (until ENG-725 it reported `onBlockClosed('segmentacao')` and the shell raised the olive screen): the domain's `mode: 'concluida'` simply mounts this station, and it is the Review that raises the end-of-flow screen (`onBlockClosed('historia')`, handled in @/ui/organisms/block-done/block-done.tsx).
- The itinerant `Player` (@/ui/app/player-slot.tsx, @/adapters/audio) is injected by prop, like @/ui/pages/listen and @/ui/pages/phrases; the necklace only reports which bead was tapped.
- Imports `sceneColor` from @/ui/tokens (`ui/tokens/tints.ts`, moved there in this same change) rather than from a sibling page — pages must not import from other pages.
- **The necklace is deliberately NOT height-capped here** (no `maxHeight`, unlike the other four stations): this is the panorama, so a long story makes the page taller and the page scrolls, rather than the necklace scrolling inside a strip.

### Core Implementation

- **`Review({ player, sound, onBlockClosed })`**: a single `useMemo` keyed on `session` derives every locked scene sorted by bead position (`lockedParts` from @/domain), each carrying its locked phrases (`frases` filtered by `part_link === part_id`) plus the necklace's structural props — `segments` (tagged scenes tinted by `sceneColor(index)`; none-fit scenes as tint-less `noneFit` segments, cream and dashed to their last bead, matching the design's `none`/`noneEnd`), `lockedEndBeads` (scene ends) and the new `phraseEndBeads` (phrase ends). One memo keeps the field stable across per-frame `playbackHead` updates, the same pattern @/ui/pages/cut and @/ui/pages/phrases use.
- **Scene pearls**: below the necklace, one @/ui/molecules `ScenePearl` per scene — label is `sceneKindLabel(kind, lang)` (@/ui/i18n/scene-kind-label.ts) for a tagged scene, or the i18n "sem nome nos tipos" string for none-fit; `fill` is the scene's confidence (`high`/`medium`/`low`) or `'none'` when untagged.
- **Click model (ported from the design prototype's `clickBead`/`selectScene`/`playSpan`):** a bead inside a locked phrase plays that whole phrase; a bead inside a scene but outside any phrase plays from the tapped bead to the scene's end; a bead outside every scene does nothing. A scene pearl plays the whole scene. Tapping the same target again STOPS — playback keys are `frase:<prop_id>`, `conta:<bead>`, `cena:<part_id>` — and tapping the glowing head bead also stops (`onHeadTap`).
- **A context line** renders only when at least one scene is none-fit or has zero phrases — it names the situation as an accepted outcome, never as a warning to fix. It agrees in number with the scenes it describes (`rever.hintNone`/`hintNoPhrase` with i18next `_one`/`_other` forms; `hintBoth` composed from `hintBothNone` + `hintBothPhrase` + a tail that says "as duas" for exactly two scenes and "todas" for more); the counts only pick the form and are never rendered.
- **A legend** in the nav footer (the `aside` slot of `StationNav`, left of "Concluir a história", as the design places it) explains the confidence fills and the two end-bead marks (phrase end vs scene end) in plain words, since the marks themselves carry no digits or labels of their own. The footer's centre stays empty: the design's "Rever · a história inteira" label is the context label the owner removed from the footer, and only the owner can bring it back.
- **Concluding is a two-step gesture when the story is doubtful.** If any scene is none-fit/untagged or carries `low` confidence, the first tap of "Concluir a história" shows a warning (`rever.warn`, self-dismissing after 9 s, or cleared immediately by any other tap) and does NOT conclude; the second tap (or the only tap, on a clean story) stops audio, plays `sound.advance()` and calls `onBlockClosed('historia')`. The button is published through `StationNav` (@/ui/organisms/nav-footer), like every other station's advance action.

### Things to Know

- **The page never mutates the session.** There is no `sessionStore.apply` call anywhere in this station — it is read-only by construction, matching the owner's "nothing is edited here" rule.
- **No digits ever render**: scene identity comes from color, position and the spelled-out kind label, never a number; the warning text names the situation ("algumas cenas ficaram na dúvida") without counting how many.
- **Confidence lives in the pearl's own fill, not in a separate disc** — see @/ui/molecules/scene-pearl for why this is deliberately NOT the @/ui/atoms `ConfidenceDisc` pattern used elsewhere.
- **This slice does not conclude the session server-side.** `onBlockClosed('historia')` only raises the shell's end-of-flow screen (@/ui/organisms/block-done); persisting a concluded status is ENG-702's job, not this station's.
- The audio seam is the same as every other station: `player` defaults to `null` — with no player the click model still resolves state (which scene/phrase was tapped) but produces no sound.

Created and maintained by Nori.
