# Noridoc: fixtures

Path: @/fixtures

### Overview

- Deterministic test data powering **fixture mode** — the default mode in which the entire app and every UI/E2E test runs with no real API (see @/adapters/docs.md).
- Two areas: `bucket/` — project-bucket audio entries, each a small WAV plus a JSON acousteme envelope (`{version, data}`) and a collection-consent flag; `sessions/` — ready-made session-state DTOs (in progress at each station, completed with artifacts, with an active editor lock).
- Currently README stubs; populated by ENG-241 (bucket entries + granularity stub data), ENG-253 (a synthetic-PCM entry mirroring a golden case), and E2/E6 issues as UI/E2E tests need session states.

### How it fits into the larger codebase

- Consumed by the fixture implementations in @/adapters (`BucketSource`, `SessionStore`, `GranularityResolver` stub) and by Playwright E2E specs.
- The session DTO shape is defined by @/contracts (session-state schemas, ENG-234) — fixtures here must validate against those schemas.
- One bucket entry deliberately mirrors a golden case's seeded-LCG synthetic PCM, tying fixture-mode app behavior to the same audio the harness in @/tests/golden verifies against.
- Excluded from dependency-cruiser scanning and from coverage (@/.dependency-cruiser.cjs, @/vitest.config.ts) — this is data, not code.

### Core Implementation

- Bucket entry anatomy follows PRD §7.4 (@/docs/PRD-colar-de-sons-v2.md): the bucket is the **only** MVP audio source, and every audio travels with its acousteme data (the granularity source) and its collection-consent flag (decision O6).
- The acousteme envelope shape is **provisional until open item O8 closes** (PRD §15.2) — the derivation rule from acoustemes to bead duration is owned by the pipeline/API team; fixtures use placeholder-shaped envelopes and the stub resolver returns fixture durations (medium ≈ 0.25 s).

### Things to Know

- **Never commit real community audio here.** Voices of speakers from small oral communities are personal — effectively identifying — data, and stories may be culturally owned material (LGPD, PRD §12). Only synthetic audio or the team's own test recordings are acceptable.
- Expect the envelope JSON shape to change when O8 resolves; anything reading it should go through the `GranularityResolver` port, never parse envelopes ad hoc.
- Session fixtures exist to exercise real flows (resume mid-station, review a completed session, encounter a lock) — keep them valid against the contracts schemas rather than hand-crafting partial states.

Created and maintained by Nori.
