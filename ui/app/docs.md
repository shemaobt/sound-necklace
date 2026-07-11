# Noridoc: ui/app

Path: @/ui/app

### Overview

- The composition root and wiring layer of the Shemá app (ENG-224): the only place that imports adapters, @/domain, @/ui/state and @/ui/organisms together. It is the durable shell — station/adapter/addon issues almost always land purely by ADDING files under @/ui/pages, @/adapters or `ui/app/addons`. Rare, deliberate one-time exceptions wire a page that needs shell-held ports (ENG-270 made the Export tail reachable and injects the sessions store + sessionId — see Things to Know).
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
- **The fio-de-contas stepper** (@/ui/app/stepper-model.ts + @/ui/app/stepper.tsx): `stepperStations` derives the six station states (Ouvir · Cortar · Triagem · Frases · Conversa · Guardar) from domain `modeLocks()` (@/domain) plus mode/flow position. `reachable` mirrors the gates; `state` is done/current/future by flow index. The Guardar (export) tail has no domain mode — the domain `Mode` is only escuta|triagem|segmentacao|mapeamento — so its `reachable` equals the Conversa/mapeamento gate (`modeLocks().mapeamento`: whole story confirmed + ≥1 locked phrase in a productive scene), and entering it is a shell-local concern: the optional `{ viewingExport }` option marks Guardar as `current` (earlier beads as `done`) without any domain mode change. It is a progress indicator, not free navigation — the `<ol>` uses one delegated click handler mapped by `<li>` index, and only navigates to `reachable` stations. Zero digits render (PRD §9.2); the station `key` doubles as the @/ui/pages directory name the station registry resolves.
- **Review/lock chrome** (@/ui/app/review-banner.tsx, PRD §8.10 / §7.3): renders the review banner and "Destravar para editar" when in review with no foreign lock; when another editor holds the advisory lock it shows "sessão em uso por <name>" and offers no unlock (the lock forces review). State comes from the session store.
- **Station host** (@/ui/app/station-host.tsx): resolves the active station from the registry; a not-yet-built station falls back to a quiet "estação em construção" line, so a station issue enters purely by adding its `ui/pages/<station>/` folder. It accepts optional `stationProps` and forwards them to the resolved component: most stations resolve everything internally (session via `useSessionStore`) and take no props, while stations needing shell-held wiring ports receive them here. Prop-less stations ignore unknown props. @/ui/app/App.tsx passes `{ store, sessionId }` only when the Export station is current — `store` is the app-global sessions adapter (@/ui/app/session-adapter.ts), `sessionId` comes from the `/session/:id` route. The in-session body lives in a `SessionStations` child that holds the local `viewingExport` flag: clicking the reachable Guardar bead sets it true (landing on Export); navigating any other station clears it and dispatches `setMode` as before. That child is remounted via `key={sessionId}`, so switching sessions resets `viewingExport` — without the remount the flag would leak and a session that never reached the gate would open on Export (the reset avoids `set-state-in-effect`/`set-state-in-render`, both lint errors here).
- **Header** (@/ui/app/header.tsx): Shemá brand (icon + eyebrow "Arquivo Oral · Tripod" + "Colar de Sons" title + subtitle) and the sound toggle (`aria-pressed`, drives `appStore.muted`). Presentational — station audio consults the muted flag; this is v2-only chrome with no golden-harness constraint.
- **Addons layer** (@/ui/app/addons-layer.tsx): a fixed bottom-right overlay region above the station, `pointer-events: none` except on the addons themselves — discreet chrome that never blocks the station. Its first occupant is the tutorial addon (@/ui/app/addons/tutorial.tsx): it reads the session from @/ui/state's `useSessionStore`, derives the current station via @/ui/app/stepper-model.ts (`stepperStations`, the entry whose state is `current`), and renders the @/ui/organisms/tutorial-popup organism keyed by that station; no session (login/dashboard) renders nothing. The popup deliberately renders inline (no Radix portal) so it stays inside `.cds-addons-layer` — never inside the station's `main`.

### Things to Know

- **The shell is edited only for shell-held wiring, and rarely.** The add-a-file registries mean stations/adapters/addons normally land without touching this folder; the durable-shell promise is about registration, not immutability. The exception is wiring a page that cannot resolve everything internally: ENG-270 made the Export tail reachable and injects `{ store, sessionId }` into it, since a completion/download page needs the shell-held sessions store and the route's session id. The registries themselves stay static top-level `import.meta.glob` literals (a Vite requirement) wrapped in factories whose modules-map parameter defaults to the glob, so tests inject a fake map without touching disk; zero matches yields `{}`.
- **The app-global sessions store** (@/ui/app/session-adapter.ts, `appSessionStore()`): one lazily-memoized SessionStore singleton resolved from the `sessions` port of the adapter registry (fixture by default; real-mode env selection is ENG-247). The shell injects it into the Export station so completion and direct downloads work (PRD §8.8/§10.5).
- **Known limitation — Setup/Dashboard do not yet share the app-global store.** @/ui/pages/setup and @/ui/pages/dashboard still resolve their OWN SessionStore singletons via their local `ports.ts`, so a session created in Setup is not yet visible to the shell-injected Export store. Unifying them (pointing setup/dashboard at `appSessionStore()`, or a route→session load) is out of ENG-270's `ui/app`-only scope and is left to ENG-247/ENG-252.
- **The addons glob eats every direct-child `.tsx`**: `/ui/app/addons/*.tsx` eagerly imports ANY sibling `.tsx` as an addon component. Never place a non-addon `.tsx` directly in `ui/app/addons/` — addon tests live one level down in `ui/app/addons/__tests__/`, outside the one-level glob. The header comment in @/ui/app/addons-layer.tsx still says the directory starts empty in production; that predates the first addon — @/ui/app/registries.test.ts now asserts real glob discovery (the tutorial addon is found) instead of emptiness.
- The player container invariant is load-bearing: never swap the portal container — move the persistent holder node instead, or the whole player subtree remounts (react#12247) and playback dies on every station change.
- Navigation never bypasses the gates: the stepper only calls `onNavigate` for `reachable` stations, and `App` funnels the `setMode` through `sessionStore.apply`, which is a no-op unless `canEdit()` (see @/ui/state/docs.md). Offline/review/lock therefore freeze station changes without losing state.
- Online state has two sinks on purpose: the local flag renders @/ui/organisms/connection-gate immediately, and `sessionStore.setOnline` pauses mutations — both fed from one `connectivity` port subscription (fixture by default, so the app and tests run with no network).
- All UI copy here is PT-BR and reuses the PRD's contract-level strings verbatim (banner text, brand lines, station labels).

Created and maintained by Nori.
