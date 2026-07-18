# Noridoc: listen

Path: @/ui/pages/listen

### Overview

- The first flow station to land (ENG-229): the ceremonial "Escuta 1 — Ouça a história" opening (PRD v2 §8.3, redesign §6.2) where the listener plays the whole recorded story and makes the single decision "Já ouvi a história completa".
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders the @/ui/organisms `Necklace` as pure transport, and dispatches the whole-story confirm/reopen domain reducers.
- Full-bleed olive ceremonial treatment (Merriweather-italic tagline, brand watermark) with exactly one instruction line and one dominant action, per the listener-facing UI rules.

### How it fits into the larger codebase

- **First occupant of the previously-empty @/ui/pages stations layer.** Stations self-register through the `import.meta.glob('/ui/pages/*/index.tsx')` station registry built in @/ui/app/registries.ts, so the default export in `index.tsx` is mandatory — it is the value the registry stores. The directory name `listen` is the registry key, and @/ui/app/App.tsx's `KEY_TO_MODE` maps it (alongside `cut`) to the domain `escuta` mode.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import adapters, @/domain, @/ui/state, @/ui/organisms, @/ui/atoms and @/ui/tokens — the only place besides @/ui/app and templates allowed to reach adapters.
- Reads session state via `useSessionStore` and writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause the confirm/reopen without losing in-memory state.
- Confirm dispatches `confirmWhole` (@/domain/scenes.ts), which advances the guided flow — it sets `whole.confirmed`, flips `mode` to `escuta`, drops `review`, and enters the parts (scenes) layer. Reopen dispatches `reopenWhole`, which reverts confirmation and returns `current` to the whole layer.
- The itinerant `Player` (@/ui/app/player-slot.tsx, @/adapters/audio) is injected by prop, not constructed here — see the audio seam below.

### Core Implementation

- **`Listen({ player })`** (@/ui/pages/listen/index.tsx): subscribes `session` from the store; renders `null` until a session exists. Local React state holds only the `playbackHead` (mirrored from the player), a `heardEnough` flag and the last domain error string.
- **`heardEnough` is a presentational nudge, not a gate** — once the playhead has _covered_ ≥90% of the story's beads (a `Set` of the visited bead indices, so jumping to the last beads does not count), `data-heard` flips on the decision wrapper (`.cds-listen-decision`), lighting the confirm pill. The 10% slack absorbs a dropped animation frame. It never blocks confirming earlier — the domain's `confirmWhole` is the only real gate. This deliberately diverges from the Protótipo's `heardTo >= N-6`, an absolute margin that lit up on the first tick of a ≤6-bead story and on any sampling of a long story's tail (ENG-294; owner's call). The necklace uses the @/ui/organisms/necklace size preset `SIZE_L` (26px beads), shared with @/ui/pages/cut.
- **Transport wiring** — the necklace runs in `transportOnly` mode (the whole colar is the play control, PRD §8.2). Bead pointer-downs and taps on the bright playback head route through pure handlers from @/ui/pages/listen/transport.ts.
- **`makeTransportHandlers(player, totalBeads)`** (@/ui/pages/listen/transport.ts): each bead tap plays `[bead, N-1]` under a fresh key `conta:<n>`, so tapping any bead always restarts from there instead of pausing; `onHead` re-toggles the last started playback, which the audio gate reads as pause/resume because the key matches. (There is no `onBig` — the "Ouvir a história" button it served was removed in ENG-291 when the colar itself became the only play control.)
- **Head + cleanup effects** — one `useEffect` subscribes `player.onHead(setHead)` (the returned unsubscribe is the cleanup); another registers `player.stop()` on unmount. The `playbackHead` flows down to the `Necklace` for imperative lighting.
- **Confirm/reopen** — `confirmWhole` returns a result; on failure the exact domain error copy is shown in a `role="alert"` line, on success `apply(() => result.state)` replaces the session. Reopen clears the error and applies `reopenWhole`.

### Things to Know

- **The audio seam is the extension point.** `player` defaults to `null`; with no player the necklace renders without playback and the transport handlers are absent (`handlers?.` optional calls). In runtime the audio engine is only wired by Setup (ENG-243), so today the station runs primarily under test and via the `FixtureAudioEngine` fixture — document/extend audio through this prop, not by constructing an engine here.
- **Grid alignment invariant:** the injected player's grid (`beadSec` / decoded duration) must match the session grid (`totalBeads` / `beadSec`) or bead-to-time mapping drifts — both are threaded from the same session here.
- The success/error branch mirrors the domain contract exactly: the "span incomplete" copy comes from @/domain (`SCENE_ERROR_COPY.WHOLE_SPAN_INCOMPLETE`), never re-authored in the UI, so the guided flow never advances unless the whole span covers 0…N−1. That copy is therefore **PT-BR even when the UI is in EN** — the station's own copy translates (@/ui/i18n), the domain's does not.
- Reopen preserves the reference quirk: `reopenWhole` does not clear selection/pendingStart — that behavior lives in @/domain, not here.
- Decorative tagline motion (@/ui/pages/listen/listen.css) is guarded by `@media (prefers-reduced-motion: no-preference)`; bead lighting motion lives in the atoms, already guarded there.
- Tests split by suffix: `transport.test.ts` and `listen.test.tsx` run in jsdom; `listen.browser.test.tsx` runs in real Chromium for bead/head taps against real geometry (jsdom has no Web Audio and zeroed layout).

Created and maintained by Nori.
