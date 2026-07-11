# Noridoc: adapters/granularity

Path: @/adapters/granularity

### Overview

- The `GranularityResolver` port (ENG-241, PRD §6.1 / §8.1): the facilitator picks a LEVEL (Pequena/Média/Grande) and the system resolves it to ONE uniform `beadSec`. The port exists so the app never invents the derivation rule — it only calls `resolve(level, acousteme)`.
- Shipped as a **STUB** (`StubGranularityResolver`): the real acousteme→beadSec rule is open item **O8** (§15.2, owner: pipeline team) and lands in ENG-242. There is deliberately **no derivation math** here.
- Self-registers via `register.ts` under the `granularity` port, same shape as @/adapters/audio (see @/adapters/docs.md).

### How it fits into the larger codebase

- Resolved by the composition root @/ui/app via the `granularity` port name (`import.meta.glob('/adapters/*/register.ts')`, @/docs/architecture.md §4).
- The Setup station (ENG-243) calls `resolve(level, audio.acousteme)` to get the `beadSec` it uses to build the grid + `manifest_id` before creating the session.
- Consumes the `AcoustemeEnvelope`/`GranularityLevel` types from @/contracts/bucket.ts. Per @/.dependency-cruiser.cjs this folder may not import `ui/`.

### Core Implementation

- **`StubGranularityResolver`** (@/adapters/granularity/stub.ts): `resolve` reads a fixture-authored `data.bead_sec[level]` from the acousteme envelope when present and positive; otherwise it falls back to PROVISIONAL fixed constants (`media = 0.25 s`, the v1 reference). `beadSec` is always > 0.
- The envelope's `data` is opaque (`z.unknown()`, §15.2 O8): `readFixtureBeadSec` navigates it defensively and returns `null` on any shape mismatch, never interpreting it beyond "a number per level".
- **`register.ts`** wires `fixture` and `real` to the SAME stub until ENG-242 supplies the O8 rule; only that one factory changes then.

### Things to Know

- **This is a stub by design** — a grep-able `PROVISIONAL` marker lives in stub.ts (asserted by a test). Do not add O8 semantics here; that is ENG-242 (labelled blocked-O8).
- The fallback constants are provisional placeholders, not a spec — the only documented anchor is `media ≈ 0.25 s` (CLAUDE.md / PRD §6.1).
- Fixture bead durations are authored in @/fixtures/bucket/audios.ts (per-audio `acousteme.data.bead_sec`); the stub only reads them, so changing granularity behavior in fixture mode means editing that data, not this resolver.

Created and maintained by Nori.
