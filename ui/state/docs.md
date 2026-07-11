# Noridoc: ui/state

Path: @/ui/state

### Overview

- The domain-state bridge (ENG-224): thin Zustand stores that wrap the pure @/domain `SessionState` and the app-global UI flags, so the screens read/write session data through hooks without any component ever mutating domain state directly.
- Two stores: @/ui/state/session-store.ts (the session plus its editability gate flags) and @/ui/state/app-store.ts (the global `muted` sound toggle that survives session changes). Both are exported from @/ui/state/index.ts.
- The guiding split: @/domain decides WHAT changes; this layer decides WHETHER a change is allowed to happen.

### How it fits into the larger codebase

- Sits between @/domain and the wiring layer (@/ui/pages, @/ui/templates, @/ui/app). Per @/.dependency-cruiser.cjs it may import @/domain (types + reducers) and zustand, but NEVER adapters — persistence arrives as an injected `autosave` port instead. This ban is a required CI boundary check.
- Consumed by @/ui/app: `App` reads session/review/lock/online/muted through `useSessionStore`/`useAppStore`, dispatches `setMode` via `sessionStore.apply`, and reflects the connectivity port into `setOnline`. Stepper reachability, the review banner, and the connection gate all derive from these flags.
- Holds the three editability gates spread across the PRD: review mode (§8.10), the single-editor advisory lock (§7.3), and the online-only gate (§13). The domain gate math (`modeLocks`, whole-story/scene gates) stays in @/domain; this store layers the human/collaboration/network gates on top.

### Core Implementation

- **`createSessionStore(deps)` factory + `sessionStore` singleton** (@/ui/state/session-store.ts): a Zustand vanilla `createStore` holding `session: SessionState | null` plus `review`, `lock`, `online`. Every mutation flows through a single `apply(reducer)` entry point.
- **`apply(reducer)`** runs the reducer ONLY when `canEdit()` is true, then calls the injected `autosave` port. Otherwise it is a silent no-op — offline, review, and a foreign lock PAUSE editing without clearing in-memory state (nothing typed or anchored is lost).
- **`canEdit()` invariant:** `online && !review && lock === null && session !== null` — the exact predicate every edit path checks.
- **Lock forces review:** `setLock(holder)` sets the lock and turns `review` on together; `unlock()` clears review ONLY when no lock is present, so a session another editor holds cannot be unlocked into edit mode.
- **`autosave` is an injected port** (`SessionStoreDeps`), defaulting to a no-op. This is why the layer can persist without importing adapters. The `sessionStore` singleton is created with the default no-op; the shell wires the real port at runtime via **`setAutosave(fn)`** (ENG-273) — the singleton is imported before any adapter exists, so a runtime setter (not a constructor arg) is how @/ui/app connects continuous persistence while ui/state stays adapter-free. Passing `undefined` unwires it. Each `apply` then calls the current port with the freshly-computed state.
- **`createAppStore` + `appStore`** (@/ui/state/app-store.ts): the global `muted` sound toggle, kept separate from the session store because it outlives any single session and enters no exported artifact.

### Things to Know

- **Pausing is not clearing.** Offline/review/lock make `apply` a no-op but leave `session` intact; the mechanism deliberately preserves state so a dropped connection or a review toggle never loses work.
- The store never imports adapters by design — if you need persistence, inject it through `SessionStoreDeps.autosave`; do not reach for the SessionStore adapter here.
- Zustand 5 selector trap (see @/ui/docs.md): selectors returning fresh references need `useShallow`; the `useSessionStore`/`useAppStore` hooks take a plain selector via `useStore`.
- `EditorLock` is an advisory presence marker (`{ holder }`) — its mere presence means the session is open by someone else; it is surfaced read-only by @/ui/app/review-banner.tsx.

Created and maintained by Nori.
