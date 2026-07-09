# Noridoc: adapters/connectivity

Path: @/adapters/connectivity

### Overview

- The online-only gate port (ENG-224, PRD §7.3 / §13): a session requires a connection, so when it drops, editing pauses (the session store blocks mutations) while in-memory state is preserved and client-side playback keeps working.
- `ConnectivityMonitor` (@/adapters/connectivity/types.ts) is the port: `isOnline()` + `subscribe(cb)`. A `ReachabilityProbe` type is also defined for a future backend-reachability confirmation (the fixture needs none).
- Ships fixture and real implementations plus a self-registering `register.ts`, following the same shape as @/adapters/audio (see @/adapters/docs.md).

### How it fits into the larger codebase

- Resolved by the composition root @/ui/app: `App`'s `useOnline` hook builds the adapter registry, reads the `connectivity` port's fixture factory, subscribes, and mirrors the value into both @/ui/organisms/connection-gate (visual gate) and `sessionStore.setOnline` (which pauses `apply`).
- @/adapters/connectivity/register.ts default-exports `{ port: 'connectivity', fixture, real }`; the shell picks it up via `import.meta.glob('/adapters/*/register.ts')` (@/docs/architecture.md §4). Fixture is the default; the real mode activates later by environment config (ENG-247).
- Per @/.dependency-cruiser.cjs this folder may not import `ui/`; only the wiring layer reaches it, and only through the port name — never by importing an implementation class.

### Core Implementation

- **`FixtureConnectivityMonitor`** (@/adapters/connectivity/fixture.ts, the DEFAULT): a manual `setOnline` toggle over an internal boolean and a subscriber set, so the app and tests exercise the online-only gate with no network. It notifies only on an actual value change and does not emit the initial value on subscribe.
- **`BrowserConnectivityMonitor`** (@/adapters/connectivity/browser.ts, real): reads `navigator.onLine` and subscribes to the window `online`/`offline` events. The `nav` and `target` dependencies are constructor-injectable (default to `globalThis.navigator`/`globalThis.window`) so it can be tested in node without a real `window`.
- **`register.ts`** wires the port: `fixture: () => new FixtureConnectivityMonitor()`, `real: () => new BrowserConnectivityMonitor()`.

### Things to Know

- **Fixture is the default and carries no network dependency** — the whole app and every test run offline-capable; do not gate behavior on the real monitor existing.
- The port intentionally decides only online/offline; the actual editing freeze lives in @/ui/state (the `apply` no-op) and the visual affordance in @/ui/organisms/connection-gate. Losing connection pauses without clearing state.
- `subscribe` never replays the current value — callers read `isOnline()` once up front (as `App`'s `useOnline` does) and then rely on transition callbacks.
- The `register.ts` re-declares a local `AdapterRegistration<TPort>` shape matching the one in @/adapters/audio; the composition-root registry consumes the `{ port, fixture, real }` contract by name.

Created and maintained by Nori.
