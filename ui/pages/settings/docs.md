# Noridoc: settings

Path: @/ui/pages/settings

### Overview

- The Configurações station (ENG-352): what applies to the whole project, outside story creation. Reached at `/settings` — the shell resolves an unknown top-level route by its first path segment against the station registry (@/ui/app/registries.ts), so this folder existing is the whole wiring.
- Two cards with deliberately different weight (owner's reference screen, 2026-07-24). **Interface language** is a reversible per-person preference in a plain white card. **Bead granularity** is the project's irreversible decision and gets the ceremonial dark-olive card: the bead cord, the lock on the button, and the sentence saying it does not change afterwards.
- `Settings({ store, projectId, canEdit })` — ports by prop in tests, mode-aware defaults in `ports.ts` for production.

### How it fits into the larger codebase

- Writes through @/adapters/project-settings → `PUT /api/sound-necklace/projects/{id}/settings` (tripod-api, ENG-361). The API gates the write on `project_admin`; this screen reads the same role up front (`defaultCanEdit` → `canEditProjectGranularity` in @/ui/app/bucket-adapter.ts) so it never offers a control that is going to 403.
- @/ui/pages/setup is the reader: it displays the confirmed size and refuses an audio whose acousteme would resolve to a different grid. A project with no granularity yet links here.
- The language card drives `setLang` from @/ui/i18n. Since ENG-371 this is the ONLY surface that changes the UI language: the header and Dashboard toggles were removed, so there is nothing left to drift against. `/settings` needs no route entry — @/ui/app/registries builds the station registry by globbing `/ui/pages/*/index.tsx`, and an unmatched top-level path resolves by its first segment in @/ui/app/App.tsx.

### Things to Know

- **Confirming IS the lock** (ENG-361). It does not wait for the first story: the moment the admin confirms, the level is permanent, and the API answers `409 PROJECT_GRANULARITY_LOCKED` to anything else. The button says so before the write happens, which is the point — a screen that locked silently on some later event would be a trap.
- **The card has two shapes, not one with a disabled control.** Confirmed, it shows the size and explains; it does not grey out the radios. Re-cutting a project at a new granularity re-derives every `manifest_id` it has already cut — that is a migration, not a permission problem, and a greyed-out radio would frame it as the latter. (The dictionary line used to say "exported"; ENG-700 corrected it to "cortado" — there is no export left to re-derive, only the cuts already made.)
- **A mid-flight lock is handled**, not just the on-load one: somebody else can confirm between this screen's read and its save, and the `409` comes back as `GranularityLockedError` → the card switches to the confirmed shape instead of showing a generic error.
- **Only PT and EN are offered.** The reference screen draws a third card (Español), but translating the app is a human translator's job, not layout — it needs its own issue. A card that translated nothing would be worse than its absence.
- The bead cord is a **preview, not data**: smaller beads means more of them fit, which is what the level means. It is `aria-hidden` — the level's name and description carry the meaning for a screen reader.
- The eyebrow reads just "Projeto" because **no endpoint exposes a project name today** (`my-project-roles` returns ids, `SessionSummary` carries `project_id` only). The reference shows "PROJETO · RUTH 2024"; the name needs a contract addition first.

Created and maintained by Nori.
