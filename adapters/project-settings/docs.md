# Noridoc: project-settings

Path: @/adapters/project-settings

### Overview

- The `ProjectSettingsStore` port (ENG-352): the bead granularity a **project** cuts at. `get(projectId)` reads it, `setLevel(projectId, level)` decides it, `noteSessionCreated(...)` says the project just cut something.
- Real mode is @/adapters/project-settings/http.ts against `GET`/`PUT /api/sound-necklace/projects/{id}/settings` (tripod-api, ENG-361); fixture mode is @/adapters/project-settings/fixture.ts, an in-memory store that reproduces the backend's two rules rather than just holding values.
- `fetch` is injected, like every adapter here, so nothing in CI touches the network.

### How it fits into the larger codebase

- Two screens read the same store and must see the same decision: @/ui/pages/setup (displays the level, refuses a divergent audio) and @/ui/pages/project-settings (decides it). They share one app-global singleton via @/ui/app/project-settings-adapter.ts — in fixture mode "the same decision" only exists if it is literally the same instance.
- The DTO is @/contracts/api.ts (`ProjectSettingsSchema`), validated on the way in. The level then feeds @/adapters/granularity, which resolves it to `beadSec` **per audio** off that audio's acousteme.

### Things to Know

- **`bead_sec` is not settable, by design.** The admin picks a LEVEL; the duration is `granularity_frames[level] × hop_sec` from each audio's own acousteme (the O8 rule), so nothing knows it until an audio is cut. The project's first session stamps it server-side. A client that could assert `bead_sec` could assert a wrong grid — and `beadSec` is mixed into `manifest_id`, so a wrong grid is a corpus on two coordinate systems.
- **The level freezes once the project has a session.** The API answers `409` with `code: PROJECT_GRANULARITY_LOCKED`, which the adapter turns into `GranularityLockedError` so the screen reacts to the verdict rather than to a number. A 409 **without** that code is deliberately not read as locked — treating every 409 the same would hide a real conflict behind the wrong explanation.
- **Re-sending the level a project already has is a no-op, not a conflict.** A settings screen must be able to save what is already on it; refusing that would make the frozen state impossible to render honestly. The fixture reproduces this.
- **`noteSessionCreated` is a no-op in real mode.** The API's `create_session` stamps the grid and freezes the level in the same transaction that writes the session. It is on the port only because the fixture has no server to do that for it, and without it an app running with no API would never show the rule that freezes the level.
- The fixture's registration **seeds the fixture project (`projeto`) at `medium`**. Without a seed the first screen would read "nobody decided yet" and the demo's Setup could not create a session at all.

Created and maintained by Nori.
