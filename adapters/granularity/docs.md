# Noridoc: adapters/granularity

Path: @/adapters/granularity

### Overview

- The `GranularityResolver` port (ENG-241, PRD §6.1 / §8.1): the facilitator picks a LEVEL (Pequena/Média/Grande) and the system resolves it to ONE uniform `beadSec`. The port exists so the app never invents the derivation rule — it only calls `resolve(level, acousteme)`.
- Implements the now-resolved **O8 rule** (§15.2 / §6.1, source: tripod-api PR #100 "acousteme artifact + consumption API", ENG-242): `beadSec = granularity_frames[level] × hop_sec`. The resolver only applies the envelope's own fields — it never invents the derivation.
- Self-registers via `register.ts` under the `granularity` port, same shape as @/adapters/audio (see @/adapters/docs.md).

### How it fits into the larger codebase

- Resolved by the composition root @/ui/app via the `granularity` port name (`import.meta.glob('/adapters/*/register.ts')`, @/docs/architecture.md §4).
- The Setup station (ENG-243) calls `resolve(level, audio.acousteme)` to get the `beadSec` it uses to build the grid + `manifest_id` before creating the session.
- Consumes the `AcoustemeEnvelope`/`GranularityLevel` types from @/contracts/bucket.ts. Per @/.dependency-cruiser.cjs this folder may not import `ui/`.

### Core Implementation

- **`AcoustemeGranularityResolver`** (@/adapters/granularity/resolver.ts): `resolve(level, acousteme)` maps the UI level (pequena/media/grande) to the backend frame key (small/medium/large) and returns `beadSec = acousteme.granularity_frames[key] × acousteme.hop_sec`. `beadSec` is always > 0.
- Audios without an acousteme (`acousteme = null`, §6.1) fall back to the **same uniform tokenizer grid** the backend embeds in every envelope — `hop_sec = 0.02` (20 ms) and frames `{ small: 10, medium: 25, large: 50 }`, resolving to **0.20 / 0.50 / 1.00 s** for Pequena / Média / Grande.
- **`register.ts`** points both `fixture()` and `real()` at the SAME `AcoustemeGranularityResolver` — the frames×hop rule is identical in both modes; only the `BucketSource` supplying the envelope differs.

### Things to Know

- The tokenizer grid is **fixed and uniform across all audios** (Pequena 0.20 s / Média 0.50 s / Grande 1.00 s) — the resolver reads `granularity_frames × hop_sec` from the envelope rather than hardcoding those durations.
- Média = 0.50 s (25 frames × 20 ms) is the value the golden byte-identity cases assume (a 24-bead grid over 12 s), so the resolved grid keeps the harness green.
- Fixture envelopes are authored in @/fixtures/bucket/audios.ts (each carrying `hop_sec` + `granularity_frames`); the resolver only applies them, so changing granularity behavior in fixture mode means editing that data, not this resolver.

Created and maintained by Nori.
