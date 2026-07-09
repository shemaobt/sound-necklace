# Noridoc: domain

Path: @/domain

### Overview

- The **frozen core**: pure TypeScript, zero imports (no other layer, no npm packages), a 1:1 behavioral port of the v1 reference at @/docs/reference/index.html.
- Currently a scaffold — @/domain/index.ts is a barrel exporting only a layer marker. Real modules arrive in dependency order via the E1 issues: ENG-214 (grid/hash/ids) → ENG-216 (state/selection/scenes) → ENG-219 (triagem/gates) → ENG-223 (phrases/seam) → ENG-226 (mapeamento scripts + answer store).
- Exists as its own layer so the entire rule set compiles and tests with no framework/IO, making byte-identical artifact reproduction provable by the golden harness.

### How it fits into the larger codebase

- Innermost layer of `ui → adapters → contracts → domain`. The zero-import rule is mechanical, not conventional: @/.dependency-cruiser.cjs errors on any import of another layer **and** on any npm package from production code (tests may import vitest).
- Consumed by: @/contracts (DTO mappers over domain types), @/adapters, `ui/organisms` and `ui/state` (domain types/state via props/hooks — see @/ui/docs.md).
- The golden harness (@/tests/golden) replays scripted decision sets through `domain/` + `contracts/` and byte-diffs the artifacts against goldens generated from the reference — proving `domain ≡ reference` on every PR. This is why the layer is frozen: its behavior _is_ the product contract.

### Core Implementation

- Planned module areas (recorded in @/docs/architecture.md §2): bead grid math / FNV-1a hash / ID allocation · session state · selection · frontier · scenes · triagem · coverage · mode gates · scene-kinds (generated list) · phrases · seam · mapeamento scripts (verbatim wording) · mapping answer store.
- Non-negotiable facts the modules must implement exactly (details in @/docs/PRD-colar-de-sons-v2.md §10–§11 and @/CLAUDE.md):
  - Bead indices are the universal coordinate; grid = `floor(dur/beadSec + 1e-9)` beads plus a partial bead.
  - `manifest_id` = `fnv1a32:xxxxxxxx` over channels/rate/count/strided-int16-PCM/bead-ms.
  - IDs: `PT#` scenes (stable, lowest free), `P#` phrases (lowest free), `S#` sequential reassigned only on export.
  - Frontier: sequential locking; reopening item _i_ unlocks _i_ and everything after; first phrase may back-reach into the previous scene; seam-move threshold `max(3, 25% of scene)`; two-productive-scenes escalation.
  - Gates: whole story → scenes → (all triaged + ≥1 productive) → segmentação → (+ ≥1 phrase) → mapeamento; all-none-fit locks downstream.
  - Confidence stored as `alta`/`média`/`baixa`; tag states `pending`/`tagged`/`none_fit`.

### Things to Know

- **FROZEN LAYER / contract-critical:** any PR touching this folder requires human review; autonomous loop agents must stop and escalate rather than merge. Change requires the golden harness green AND explicit human approval.
- Coverage gate: ≥ 90% line+branch, enforced per-glob in @/vitest.config.ts. Every PRD §11 rule needs an explicit test, including edge thresholds (seam-move, partial bead, back-reach, reopen cascade). Snapshot tests do not count as coverage.
- `scene_kind` values are **English** and come from a generated list — never hand-edit; PT-BR labels are display-only and live in the UI.
- Complexity warnings are expected and accepted here: the port mirrors reference logic 1:1, so functions may exceed the lint's warn threshold (see @/eslint.config.js).
- When in doubt about behavior, read the reference's actual code — its behavior wins over any intuition or existing doc. Never "improve" reference behavior; fidelity is the requirement.
- No network calls, no `Date.now`-style ambient IO, no framework types. If a module seems to need one, the design is wrong — push it out to @/adapters behind a port.

Created and maintained by Nori.
