# Noridoc: tests/golden

Path: @/tests/golden

### Overview

- **The merge gate.** Replays scripted decision sets both through the untouchable v1 reference (@/docs/reference/index.html) and through @/domain + @/contracts, then byte-diffs the produced artifacts (`retorno-ancoragem.json`, `manifesto-contas.json`, report `.md`). Equality proves `domain ≡ reference`.
- Real infrastructure is live (ENG-212): decision scripts in `cases/`, reference-generated goldens committed under `expected/`, the Playwright driver @/tests/golden/generate.mjs, and the byte-diff runner @/tests/golden/golden.test.ts. Cases without a registered replayer show as **PENDENTE** (green with a loud warning) until ENG-238 flips `STRICT`.
- Runs as the CI job `golden-harness` (@/.github/workflows/ci.yml) via `pnpm golden` (Vitest, unit project, running @/tests/golden/golden.test.ts) on every PR. It is the one gate that can never be relaxed.

### How it fits into the larger codebase

- Guards the frozen layers: any change to @/domain or @/contracts must keep the harness green, which is why those layers are contract-critical.
- Consumes the reference read-only over `file://`; commits its generated goldens under `expected/` so they can never drift or be hand-edited.
- The synthetic-PCM approach links to @/fixtures: one bucket fixture entry mirrors a golden case's PCM, so fixture-mode app runs and the harness agree on audio.

### Core Implementation

- Design recorded in @/docs/architecture.md §5; step vocabulary and layout documented in @/tests/golden/README.md:
  - **Decision scripts** (`cases/*.json`) — a step vocabulary covering the whole flow (segment, cutScene, triage, confirmPhrase with border decisions, reopen/answers/export, …).
  - **Generation** (`pnpm golden:generate`) — headless Chromium loads the reference; each case executes inside Playwright `page.evaluate` by setting the reference's globals and calling its **real functions** directly. No UI clicking, no audio decoding.
  - **Audio** — a plain object shaped like an AudioBuffer filled with synthetic PCM from a **seeded BigInt LCG** (@/tests/golden/pcm.ts, mirrored inside `generate.mjs`); `Math.sin`/`Math.random` are banned so output is engine-independent by construction.
  - **Byte capture** — outputs are taken exactly as the reference serializes them (`JSON.stringify(x, null, 2)`, no trailing newline; `.md` joined with `\n`, one trailing newline) and committed under `expected/`.
- The CI check is **two proofs**: `golden:verify` regenerates from the reference and byte-diffs against the committed goldens (no drift), and the runner (@/tests/golden/golden.test.ts) replays every case through `domain/`+`contracts/` and byte-diffs against the same goldens.
- **Replayer registry** (@/tests/golden/registry.ts): each domain/contracts issue registers a `Replayer` — a function from a case's steps to byte-exact artifact strings. ENG-214 registered the first one, `manifestReplayer`, which drives `buildBeads`/`hashPCM` from @/domain and mirrors the reference's `buildManifest` key order; it serves the manifest-only cases.
- **Session-step replayer** (`replaySessionSteps`, same file, ENG-216 → extended ENG-219): replays the session/scene/triagem step prefix (segment → confirmWhole → cutScene → reopenScene → confirmParts → triage → triagemDone) through the pure reducers of @/domain (`createSession`, `confirmWhole`, `confirmPart`, `reopenPart`, `confirmParts`, `tagScene`/`markNoneFit`, `setMode`). The `cutScene` step mirrors the reference driver in @/tests/golden/generate.mjs: it simulates the second click by setting the selection to `{frontier, endBead}` and confirming the current scene. The `triage` step indexes `lockedParts` and tags/none-fits the target by `part_id`; `triagemDone` asserts the gate is enabled then `setMode('segmentacao')`. Steps from later issues (phraseSelect, answer, export, …) stop the replay and are reported in `pendingAt` — so `minimal-flow` now replays through triagem and stays PENDENTE only at the `phraseSelect` boundary (ENG-223), until phrases and the real export land (ENG-227/233). A domain-rejected step (a `SceneResult` error, or a disabled gate) throws loudly, so a case can never silently half-replay. Colocated tests (@/tests/golden/registry.test.ts) pin the scene+triagem prefix replay of `minimal-flow`, including the reopen cascade and `PT#` stability.
- Strictness phases: cases enable per module via `registry.ts` as the E1 domain issues land (now) → **ENG-238** flips `STRICT = true` (zero pending cases + edge-case pack; pending cases then FAIL). After ENG-238 the gate is never weakened, ever.

### Things to Know

- **If your change breaks the harness, your change is wrong — not the harness.** Never weaken it to pass; stop and escalate instead.
- Voice-answer report cells (`respostas/...` paths) do not exist in the v1 reference — those golden fixtures are **PRD-derived** (PRD §10.4 / decision O5) and must be labeled as such in the fixture README.
- The design works because Node and Chromium are both V8: `JSON.stringify` number formatting is identical across the generate/verify boundary.
- Alternatives were evaluated and rejected (recorded in @/docs/architecture.md §5): extracting reference functions into Node requires a DOM shim (i.e., a modified reference — fidelity risk); jsdom silently diverges (zeroed layout, no Web Audio); driving the reference UI with clicks is slow and unnecessary since the logic is callable directly.
- Replayers must reproduce serialization details themselves (key order, `JSON.stringify(x, null, 2)` with no trailing newline) — byte-diff means there is no tolerance for "equivalent" JSON. The `manifestReplayer` throws loudly on any step or artifact outside its ENG-214 scope so a case can never silently half-replay.
- @/domain/hash.test.ts intentionally duplicates the `pcm.ts` LCG: domain (including its tests) may not import from `tests/`, so it cannot reuse this folder's generator. Keep the two implementations and the seed-42 verification vectors in sync via @/tests/golden/README.md.

Created and maintained by Nori.
