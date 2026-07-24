# Noridoc: project-settings

Path: @/ui/pages/project-settings

### Overview

- The project settings station (ENG-352): where the **bead size** is decided, once, for a whole project. Reached at `/project-settings` — the shell resolves an unknown top-level route by its first path segment against the station registry (@/ui/app/registries.ts), so this folder existing is the whole wiring.
- A facilitator/**admin** surface (§7.2): denser text is allowed, and warranted — `beadSec` defines the bead grid and is mixed into `manifest_id`, so it is the coordinate system the downstream pipeline and the training data are built on.
- `ProjectSettingsPage({ store, projectId, navigate })` — ports by prop in tests, mode-aware defaults in `ports.ts` for production. The store is the same app-global singleton @/ui/pages/setup reads.

### How it fits into the larger codebase

- Writes through @/adapters/project-settings, which `PUT`s to tripod-api (ENG-361). The API gates the write on the `project_admin` role; this screen does not duplicate that check — it renders the refusal.
- @/ui/pages/setup is the reader: it displays the level and refuses an audio whose acousteme would resolve to a different grid. A project with no level yet links here rather than defaulting to one.

### Things to Know

- **The screen has two shapes, not one with a disabled control.** While the project has cut nothing it offers the three levels; once it has a session it shows the chosen level and explains why it no longer offers them. Re-cutting a project at a new granularity re-derives every `manifest_id` it has already exported — that is a migration, not a setting, and a greyed-out radio would frame it as a permission problem.
- **A mid-flight freeze is handled, not just the on-load one.** Somebody else can create the project's first session between this screen's read and its save; the `409` comes back as `GranularityLockedError`, and the screen switches to the locked shape instead of showing a generic error.
- **`403` gets its own copy.** Reading the settings is any role's; deciding is the project admin's, and "could not save, try again" would be a lie to a facilitator who is never going to succeed.
- The level cards deliberately reuse `setup.level*Title/Desc` from @/ui/i18n — the same three words name the same three things on both screens, and a second copy of them would drift.

Created and maintained by Nori.
