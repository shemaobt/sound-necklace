# Noridoc: fixtures

Path: @/fixtures

### Overview

- Deterministic test data powering **fixture mode** — the default mode in which the entire app and every UI/E2E test runs with no real API (see @/adapters/docs.md).
- Two areas: `bucket/` — project-bucket audio entries, each a small WAV plus a JSON acousteme envelope (`{version, hop_sec, granularity_frames}`) and a collection-consent flag; `sessions/` — ready-made session-state DTOs (in progress at each station, completed with artifacts, with an active editor lock).
- Currently README stubs; populated by ENG-241 (bucket entries + acousteme grid data), ENG-253 (two synthetic-PCM entries that inherited their names and PcmSpecs from the golden harness's `minimal-flow` and `seam-small-move` cases, deleted with the harness in ENG-691), and E2/E6 issues as UI/E2E tests need session states.

### How it fits into the larger codebase

- Consumed by the fixture implementations in @/adapters (`BucketSource`, `SessionStore`, `GranularityResolver`) and by Playwright E2E specs.
- The session DTO shape is defined by @/contracts (session-state schemas, ENG-234) — fixtures here must validate against those schemas.
- Two bucket entries (`aud_fluxo_minimo` and its `seam-small-move` sibling) still carry the same seeded-LCG `PcmSpec` and names as two cases from the now-deleted golden harness (@/tests/golden, removed in ENG-691) — they were added so ENG-253's e2e specs could drive the real UI against exactly the audio the harness verified, proving the exported artifacts were byte-identical to the golden files. That harness and those artifacts are gone; the two entries stay because @/tests/e2e still drives the real UI with them, unrelated to any byte-identity claim now.
- Excluded from dependency-cruiser scanning and from coverage (@/.dependency-cruiser.cjs, @/vitest.config.ts) — this is data, not code.

### Core Implementation

- Bucket entry anatomy follows PRD §7.4 (@/docs/PRD-colar-de-sons-v2.md): the bucket is the **only** MVP audio source, and every audio travels with its acousteme data (the granularity source) and its collection-consent flag (decision O6).
- The acousteme envelope carries the tokenizer grid that drives granularity — `hop_sec` + `granularity_frames {small, medium, large}` (the **resolved** O8 rule, PRD §15.2 / §6.1, source tripod-api PR #100); the `GranularityResolver` (@/adapters/granularity) derives `beadSec = frames[level] × hop_sec`. Every fixture envelope uses the uniform grid (hop 0.02 → Pequena 0.20 / Média 0.50 / Grande 1.00 s).

### Things to Know

- **Never commit real community audio here.** Voices of speakers from small oral communities are personal — effectively identifying — data, and stories may be culturally owned material (LGPD, PRD §12). Only synthetic audio or the team's own test recordings are acceptable.
- The provisional envelope shape may still shift with the ENG-247 API swap (the tripod-api serves it as `AcoustemeStreamResponse`); anything reading it should still go through the `GranularityResolver` port, never parse envelopes ad hoc.
- Session fixtures exist to exercise real flows (resume mid-station, review a completed session, encounter a lock) — keep them valid against the contracts schemas rather than hand-crafting partial states.

Created and maintained by Nori.
