# Noridoc: domain

Path: @/domain

### Overview

- The **frozen core**: pure TypeScript, zero imports (no other layer, no npm packages), a 1:1 behavioral port of the v1 reference at @/docs/reference/index.html.
- First real modules landed with ENG-214: bead grid math (@/domain/grid.ts), the FNV-1a `manifest_id` hash (@/domain/hash.ts), and lowest-free ID allocators (@/domain/ids.ts), all re-exported through the @/domain/index.ts barrel (which also keeps the `DOMAIN_LAYER` marker). Remaining modules arrive in dependency order via the E1 issues: ENG-216 (state/selection/scenes) → ENG-219 (triagem/gates) → ENG-223 (phrases/seam) → ENG-226 (mapeamento scripts + answer store).
- Exists as its own layer so the entire rule set compiles and tests with no framework/IO, making byte-identical artifact reproduction provable by the golden harness.

### How it fits into the larger codebase

- Innermost layer of `ui → adapters → contracts → domain`. The zero-import rule is mechanical, not conventional: @/.dependency-cruiser.cjs errors on any import of another layer **and** on any npm package from production code (tests may import vitest).
- Consumed by: @/contracts (DTO mappers over domain types), @/adapters, `ui/organisms` and `ui/state` (domain types/state via props/hooks — see @/ui/docs.md).
- The golden harness (@/tests/golden) replays scripted decision sets through `domain/` + `contracts/` and byte-diffs the artifacts against goldens generated from the reference — proving `domain ≡ reference` on every PR. This is why the layer is frozen: its behavior _is_ the product contract. The harness replayers in @/tests/golden/registry.ts import through the @/domain/index.ts barrel (currently `buildBeads` + `hashPCM` for the manifest cases).

### Core Implementation

- @/domain/grid.ts — `buildBeads` (grid = `floor(dur/beadSec + 1e-9)` beads plus a partial bead when a remainder > 1e-9 exists; every `startTime`/`endTime` is coerced through `+(x).toFixed(6)` and `endTime` is clamped to the duration), `beadAtTime` (time → clamped bead index, same epsilon), `spanDur` (span duration from bead times; throws on out-of-grid indices — a `noUncheckedIndexedAccess`-driven guard).
- @/domain/hash.ts — `PcmLike` (the minimal AudioBuffer-shaped interface: channels, sampleRate, `getChannelData`) + `hashPCM`, the FNV-1a 32-bit `manifest_id` (`fnv1a32:xxxxxxxx`). Byte-mix order is contract: channel count, the 2 low bytes of sampleRate, sample count as 4 bytes LE, strided int16-quantized samples from channel 0 (stride = `max(1, floor(N/100000))`), then `beadSec*1000` as 3 bytes LE.
- @/domain/ids.ts — `nextPartId` (`PT#`) and `nextPid` (`P#`): lowest free number, scanning ALL entries — locked or not, because pending slots occupy their ID.
- Each module carries colocated tests (`*.test.ts`). Hash tests pin known vectors computed by an independent Python oracle (the emulation script is quoted in @/domain/hash.test.ts) plus vectors derived from the committed goldens in @/tests/golden/expected, so `domain ≡ reference` holds both by construction and by byte-diff.
- Planned module areas still to land (recorded in @/docs/architecture.md §2): session state · selection · frontier · scenes · triagem · coverage · mode gates · scene-kinds (generated list) · phrases · seam · mapeamento scripts (verbatim wording) · mapping answer store.
- Non-negotiable facts the remaining modules must implement exactly (details in @/docs/PRD-colar-de-sons-v2.md §10–§11 and @/CLAUDE.md):
  - Bead indices are the universal coordinate; `S#` sequence IDs are reassigned only on export.
  - Frontier: sequential locking; reopening item _i_ unlocks _i_ and everything after; first phrase may back-reach into the previous scene; seam-move threshold `max(3, 25% of scene)`; two-productive-scenes escalation.
  - Gates: whole story → scenes → (all triaged + ≥1 productive) → segmentação → (+ ≥1 phrase) → mapeamento; all-none-fit locks downstream.
  - Confidence stored as `alta`/`média`/`baixa`; tag states `pending`/`tagged`/`none_fit`.

### Things to Know

- **FROZEN LAYER / contract-critical:** any PR touching this folder requires human review; autonomous loop agents must stop and escalate rather than merge. Change requires the golden harness green AND explicit human approval.
- Coverage gate: ≥ 90% line+branch, enforced per-glob in @/vitest.config.ts. Every PRD §11 rule needs an explicit test, including edge thresholds (seam-move, partial bead, back-reach, reopen cascade). Snapshot tests do not count as coverage.
- `scene_kind` values are **English** and come from a generated list — never hand-edit; PT-BR labels are display-only and live in the UI.
- Complexity warnings are expected and accepted here: the port mirrors reference logic 1:1, so functions may exceed the lint's warn threshold (see @/eslint.config.js).
- When in doubt about behavior, read the reference's actual code — its behavior wins over any intuition or existing doc. Never "improve" reference behavior; fidelity is the requirement. Concretely: the `1e-9` epsilon and the `+(x).toFixed(6)` time coercion in @/domain/grid.ts, and the "quirks" of @/domain/hash.ts (only the 2 low bytes of sampleRate are mixed, only channel 0 is read, `Math.imul` because the naive `h * prime` product exceeds 2^53 and silently loses bits) are all byte-identity contract — do not fix them.
- Two deliberate, documented deviations exist: (1) `buildBeads` throws on `beadSec <= 0` (and NaN) — the reference performs this validation in its UI caller (`segment()`); in the pure domain the guard moved into the function per the ENG-214 DoD; (2) `spanDur` throws a typed error on out-of-grid indices where the reference would crash with a `TypeError` on `undefined`. Both only change failure loudness for inputs the reference never produces; byte-identity is unaffected. `beadAtTime` intentionally carries NO guard — it mirrors the reference exactly (the DoD guard requirement was scoped to `buildBeads`).
- @/domain/hash.test.ts duplicates the harness's seeded BigInt LCG PCM generator on purpose: domain code **and its tests** may not import from `tests/` (dependency-cruiser rule), so it cannot reuse @/tests/golden/pcm.ts.
- No network calls, no `Date.now`-style ambient IO, no framework types. If a module seems to need one, the design is wrong — push it out to @/adapters behind a port.

Created and maintained by Nori.
