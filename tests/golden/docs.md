# Noridoc: tests/golden

Path: @/tests/golden

### Overview

- **The merge gate.** Replays scripted decision sets both through the untouchable v1 reference (@/docs/reference/index.html) and through @/domain + @/contracts, then byte-diffs the produced artifacts (`retorno-ancoragem.json`, `manifesto-contas.json`, report `.md`). Equality proves `domain ≡ reference`.
- Real infrastructure is live (ENG-212): decision scripts in `cases/`, reference-generated goldens committed under `expected/`, the Playwright driver @/tests/golden/generate.mjs, and the byte-diff runner @/tests/golden/golden.test.ts. Since ENG-233 the `minimal-flow` case fully replays and byte-compares all three artifacts (no longer PENDENTE); cases still without a registered replayer show as **PENDENTE** (green with a loud warning) until ENG-238 flips `STRICT`.
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
- **Replayer registry** (@/tests/golden/registry.ts): each domain/contracts issue registers a `Replayer` — a function from a case's steps to byte-exact artifact strings, keyed by case name. Three are live: `manifestReplayer` serves the manifest-only cases (`manifest-only`, `partial-bead`); `sessionExportReplayer` (ENG-233) serves `minimal-flow`. `manifestReplayer` drives `buildBeads`/`hashPCM` from @/domain to build a real `SessionState` via `createSession`, and since ENG-227 its `export` step goes through the **production** mappers of @/contracts (`buildManifesto` + `serializeArtifact`) — the golden byte-compares production code, not a local mirror of the reference's key order.
- **Session-step replayer** (`replaySessionSteps`, same file, ENG-216 → extended ENG-219/223/226): replays the session/scene/triagem/phrase/answer step prefix (segment → confirmWhole → cutScene → reopenScene → confirmParts → triage → triagemDone → enterScene → phraseSelect → confirmPhrase → reopenPhrase → removePhrase → toggleFlag → sceneDone → answer) through the pure reducers of @/domain. The steps mirror the reference driver in @/tests/golden/generate.mjs: `cutScene`/`phraseSelect` simulate clicks by writing the selection directly into state; `triage` indexes `lockedParts` and tags/none-fits by `part_id`; `confirmPhrase` carries an optional `borderDecision` (`move`/`reanchor`/`triagem`) applied when the confirm returns a `BorderOffer` — no decision leaves state intact, like the reference just rendering the offer; `answer` mirrors the driver — `ensureMapping` then `setAnswer` direct assignment into `state.mapping` (see @/domain/mapping.ts), addressing L2 by `partId` and L3 by `propId`. (`triagemDone`, `sceneDone`/`forceEmpty`, `toggleFlag` and reopen/remove follow the same click-fidelity discipline; see @/domain/phrases.ts for the `warnedEmptyScene` replay marker.) It consumes the full prefix and **stops at the trailing `export` step**, returning it in `pendingAt`; a domain-rejected step (a `SceneResult`/`ConfirmFraseResult` error, or a disabled gate) throws loudly, so a case can never silently half-replay.
- **Session→export replayer** (`sessionExportReplayer`, same file, ENG-233): composes on top of `replaySessionSteps` (which is unchanged), then serializes the artifacts the `export` step lists through the real @/contracts mappers — `buildManifesto` + `serializeArtifact`, `buildRetorno` + `serializeArtifact`, and `buildMapReport`. This **closes `minimal-flow`**: all three artifacts (`manifesto-contas.json`, `retorno-ancoragem.json`, `relatorio-mapeamento.md`) are now byte-diffed against the committed reference goldens on every CI run, so the case is no longer PENDENTE. Colocated tests (@/tests/golden/registry.test.ts) pin the `minimal-flow` replay, including the reopen cascades, `PT#`/`P#` stability and the seam slide.
- Strictness phases: cases enable per module via `registry.ts` as the E1 domain issues land (now) → **ENG-238** flips `STRICT = true` (zero pending cases + edge-case pack; pending cases then FAIL). After ENG-238 the gate is never weakened, ever.

### Things to Know

- **If your change breaks the harness, your change is wrong — not the harness.** Never weaken it to pass; stop and escalate instead.
- Voice-answer report cells (`respostas/...` paths) do not exist in the v1 reference — those golden fixtures are **PRD-derived** (PRD §10.4 / decision O5) and must be labeled as such in the fixture README.
- The design works because Node and Chromium are both V8: `JSON.stringify` number formatting is identical across the generate/verify boundary.
- Alternatives were evaluated and rejected (recorded in @/docs/architecture.md §5): extracting reference functions into Node requires a DOM shim (i.e., a modified reference — fidelity risk); jsdom silently diverges (zeroed layout, no Web Audio); driving the reference UI with clicks is slow and unnecessary since the logic is callable directly.
- Byte-diff means there is no tolerance for "equivalent" JSON: key order, number formatting and newline discipline all matter. JSON artifacts must come out of the single serializer in @/contracts/serialize.ts — replayers never hand-roll serialization. The `manifestReplayer` throws loudly on any step or artifact outside its scope so a case can never silently half-replay.
- @/domain/hash.test.ts intentionally duplicates the `pcm.ts` LCG: domain (including its tests) may not import from `tests/`, so it cannot reuse this folder's generator. Keep the two implementations and the seed-42 verification vectors in sync via @/tests/golden/README.md.

Created and maintained by Nori.
