# Noridoc: adapters/stt

Path: @/adapters/stt

### Overview

- The `Transcriber` port (ENG-327, PRD v2 §8.7/§12 as amended by ENG-326): machine transcription of the recorded interview answers plus a PT→EN translation, delivered as a **draft**. It is advice, never an answer — a human confirms the English in the report (@/ui/pages/report) and only then does it become the artifact's text.
- The work is **asynchronous and belongs to our API**, never to the SPA: the report starts a job when it opens and asks for progress until it finishes. That shape is why the port is `start` + `progress` rather than a single `transcribe(bytes)`.
- **Fixture only for now.** `register.real()` deliberately throws: the async job is ENG-325 and does not exist yet, and inventing an endpoint here would be guessing the contract's shape. The composition root (@/ui/app/App.tsx) mounts the fixture and the rest of the flow is unchanged when the real one lands.

### How it fits into the larger codebase

- Per @/.dependency-cruiser.cjs this folder may import @/domain and @/contracts but never `ui/`; only the wiring layer resolves the port. It currently imports neither — the port is expressed in plain strings so it stays independent of the domain's slot types.
- **The key is the voice-resource path**, `respostas/level{1,2,3}/…/<k>.webm` — the same canonical string @/domain `voiceAnswerPath` derives from a question slot and @/adapters/voice records under. Nothing here parses a slot; the path is the whole coordinate shared by the recorder, the transcriber and the export gate.
- **Consumed exclusively through @/ui/pages/report/use-stt-drafts.ts**, which owns the polling loop, the backoff and the discard-late-response rule. @/ui/pages/conversation only forwards the port and the session id down to the report station.
- **The port cannot write an artifact by construction.** A draft lands in a reserved `en__<k>` answer key that @/contracts/relatorio.ts never emits; and `reportExportStatus` (same file) blocks the export while a recorded answer has no confirmed text. So "unconfirmed draft never reaches an artifact" is enforced by two independent mechanisms, neither of which is inside this folder.
- This is the one carve-out of CLAUDE.md's "no AI-generated content" rule that touches what the listener said, and it is scoped: the machine proposes, a human disposes, and the recording itself stays in the bucket as provenance.

```
ui/app ── sttRegistration.fixture() ──▶ ui/pages/conversation ──▶ ui/pages/report
                                                                        │
                                                     use-stt-drafts ────┤ start(sessionId, paths)
                                                                        └ progress(sessionId) → drafts
                                                                              keyed by respostas/…webm
```

### Core Implementation

- **Port** (@/adapters/stt/types.ts): `start(sessionId, paths, { force })` and `progress(sessionId) → { done, drafts }`, with `drafts` a `path → { source, en }` map. `source` is the transcript in the spoken language, kept for a bilingual check; `en` is what the facilitator confirms. Drafts arrive **all at once at the end**, not incrementally — a half-filled map is never observable.
- `start` is idempotent: repeating the same request does not reprocess. `force` is the re-record case, where the old draft is invalid and the job must reopen.
- A session that never started answers `{ done: true, drafts: {} }` rather than erroring, so the report can poll without first knowing whether a job exists.
- **`FixtureTranscriber`** (@/adapters/stt/fixture.ts): deterministic by design (house pattern) — the draft text is derived from the recording's own path, so the same request always yields the same drafts and tests need no clock and no luck. The job "takes time" by **counting `progress` calls**, not milliseconds, so a test never waits on a timer.
- **`register.ts`** default-exports `{ port: 'stt', fixture, real }` per the adapter convention (@/docs/architecture.md §4, @/adapters/docs.md). Unlike its siblings it is consumed by direct import in @/ui/app/App.tsx, because the port is threaded through props rather than resolved by name.

### Things to Know

- **A finished job is not silently reopened.** `start` without `force` on an already-complete job is a no-op — reopening would wipe drafts the facilitator may be reading at that instant.
- **Per session, not per path.** One job covers the whole set of recordings; a re-record re-runs the set. Sessions never share job state.
- The fixture's `POLLS_TO_FINISH` exists only to make the "running" state reachable; nothing else depends on the number.
- **The real implementation is a deliberate hole, not an oversight.** Until ENG-325 defines the API job, `real()` throws loudly with the issue reference — the app boots on the fixture, and a wrong guess at the endpoint would be harder to remove than a missing one.
- Coverage for this layer is fixture-driven unit tests in the Vitest `unit` project; `register.ts` files are excluded from coverage (@/vitest.config.ts). Fixture-safe adapter PRs may merge autonomously on green.

Created and maintained by Nori.
