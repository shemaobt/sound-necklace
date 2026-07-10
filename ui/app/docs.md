# Noridoc: ui/app

Path: @/ui/app

### Overview

- The composition root and wiring layer of the Shemá app (ENG-224): the only place that imports adapters, @/domain, @/ui/state and @/ui/organisms together. It is the durable shell — every later station/adapter/addon issue only ADDS files under @/ui/pages, @/adapters or `ui/app/addons`, never edits this folder.
- Owns the app frame (@/ui/app/header.tsx brand + sound toggle), the "fio de contas" progress stepper, the single itinerant player, review/lock chrome, the online-only connection gate, and the station host — all mounted from @/ui/app/App.tsx.
- App entry chain: @/index.html → @/ui/app/main.tsx (loads token side-effects once) → @/ui/app/App.tsx.

### How it fits into the larger codebase

- Outermost wiring layer of the atomic-design ladder documented in @/ui/docs.md. Per @/.dependency-cruiser.cjs it may import everything (adapters, domain, state, organisms); atoms/molecules/organisms below it may not reach back up.
- **Owns the three add-a-file registries** (@/docs/architecture.md §4), created once in @/ui/app/registries.ts and never edited again:

  | Registry | Glob                      | Builder                | Keyed by       |
  | -------- | ------------------------- | ---------------------- | -------------- |
  | Stations | `/ui/pages/*/index.tsx`   | `buildStationRegistry` | directory name |
  | Adapters | `/adapters/*/register.ts` | `buildAdapterRegistry` | port name      |
  | Addons   | `/ui/app/addons/*.tsx`    | `listAddons`           | sorted by path |

  This is the loop's no-file-conflict guarantee: landing a station, adapter, or overlay = adding files, never touching a shared registry. The pattern is proven: the first addon (@/ui/app/addons/tutorial.tsx, the tutorial popup, ENG-231) landed without editing a single shell file.

- Reads domain decisions through @/ui/state stores (never mutating @/domain directly): `useSessionStore`/`useAppStore` supply session state, the review/lock/online gate flags, and the sound toggle. Stepper navigation dispatches `setMode` through `sessionStore.apply` so the domain gates decide whether the move is allowed.
- Subscribes the `connectivity` adapter port (fixture default, @/adapters/connectivity) and mirrors online state both into a local flag for @/ui/organisms/connection-gate and into the session store, which pauses editing when offline.

```
index.html → main.tsx → App.tsx (composition root)
   ├─ Header (brand + sound toggle → appStore)
   ├─ Stepper (fio de contas, stepper-model ← domain modeLocks)
   ├─ ReviewBanner (review/lock chrome ← sessionStore)
   ├─ PlayerSlotProvider (the one traveling player)
   │    └─ ConnectionGate (online) → StationHost → ui/pages station
   └─ AddonsLayer (ui/app/addons overlay chrome)
```

### Core Implementation

- **Router** (@/ui/app/router.tsx): a minimal History-API router — react-router is out of scope. `matchRoute` resolves `/login`, `/dashboard` (also `/`), `/session/:id`, else `unknown`. `navigate()` calls `pushState`/`replaceState` and then notifies subscribers by hand, because pushState never fires `popstate`; `subscribe` additionally listens for `popstate` (browser back/forward). `usePathname`/`useRoute` read through `useSyncExternalStore` with `location.pathname` as the snapshot (a primitive, so `Object.is` comparison is stable).
- **The itinerant player** (@/ui/app/player-slot.tsx, PRD §8.0 / redesign §5.2): there is ONE player instance that travels to the active station's slot. Because changing a `createPortal` container remounts the subtree (react#12247), the player node lives in a persistent detached `holder` div (lazy `useState` init) that the portal always targets; the holder is MOVED between `PlayerHost` slots via `appendChild` (append moves, does not clone) in a `useLayoutEffect`. Placement runs through refs (no `setState` during commit), so a late-mounting lazy station host still receives the player. On active-station change it calls `player.stop()`, mirroring the reference `setMode`→`stopPlayback`.
- **The fio-de-contas stepper** (@/ui/app/stepper-model.ts + @/ui/app/stepper.tsx): `stepperStations` derives the six station states (Ouvir · Cortar · Triagem · Frases · Conversa · Guardar) from domain `modeLocks()` (@/domain) plus mode/flow position. `reachable` mirrors the gates; `state` is done/current/future by flow index. It is a progress indicator, not free navigation — the `<ol>` uses one delegated click handler mapped by `<li>` index, and only navigates to `reachable` stations. Zero digits render (PRD §9.2); the station `key` doubles as the @/ui/pages directory name the station registry resolves.
- **Review/lock chrome** (@/ui/app/review-banner.tsx, PRD §8.10 / §7.3): renders the review banner and "Destravar para editar" when in review with no foreign lock; when another editor holds the advisory lock it shows "sessão em uso por <name>" and offers no unlock (the lock forces review). State comes from the session store.
- **Station host** (@/ui/app/station-host.tsx): resolves the active station from the registry; a not-yet-built station falls back to a quiet "estação em construção" line, so a station issue enters purely by adding its `ui/pages/<station>/` folder.
- **Header** (@/ui/app/header.tsx): Shemá brand (icon + eyebrow "Arquivo Oral · Tripod" + "Colar de Sons" title + subtitle) and the sound toggle (`aria-pressed`, drives `appStore.muted`). Presentational — station audio consults the muted flag; this is v2-only chrome with no golden-harness constraint.
- **Addons layer** (@/ui/app/addons-layer.tsx): a fixed bottom-right overlay region above the station, `pointer-events: none` except on the addons themselves — discreet chrome that never blocks the station. Its first occupant is the tutorial addon (@/ui/app/addons/tutorial.tsx): it reads the session from @/ui/state's `useSessionStore`, derives the current station via @/ui/app/stepper-model.ts (`stepperStations`, the entry whose state is `current`), and renders the @/ui/organisms/tutorial-popup organism keyed by that station; no session (login/dashboard) renders nothing. The popup deliberately renders inline (no Radix portal) so it stays inside `.cds-addons-layer` — never inside the station's `main`.

### Things to Know

- **This shell is written once.** The registries are static top-level `import.meta.glob` literals (a Vite requirement) wrapped in factories whose modules-map parameter defaults to the glob, so tests inject a fake map without touching disk; zero matches yields `{}`.
- **The addons glob eats every direct-child `.tsx`**: `/ui/app/addons/*.tsx` eagerly imports ANY sibling `.tsx` as an addon component. Never place a non-addon `.tsx` directly in `ui/app/addons/` — addon tests live one level down in `ui/app/addons/__tests__/`, outside the one-level glob. The header comment in @/ui/app/addons-layer.tsx still says the directory starts empty in production; that predates the first addon — @/ui/app/registries.test.ts now asserts real glob discovery (the tutorial addon is found) instead of emptiness.
- The player container invariant is load-bearing: never swap the portal container — move the persistent holder node instead, or the whole player subtree remounts (react#12247) and playback dies on every station change.
- Navigation never bypasses the gates: the stepper only calls `onNavigate` for `reachable` stations, and `App` funnels the `setMode` through `sessionStore.apply`, which is a no-op unless `canEdit()` (see @/ui/state/docs.md). Offline/review/lock therefore freeze station changes without losing state.
- Online state has two sinks on purpose: the local flag renders @/ui/organisms/connection-gate immediately, and `sessionStore.setOnline` pauses mutations — both fed from one `connectivity` port subscription (fixture by default, so the app and tests run with no network).
- All UI copy here is PT-BR and reuses the PRD's contract-level strings verbatim (banner text, brand lines, station labels).

Created and maintained by Nori.
