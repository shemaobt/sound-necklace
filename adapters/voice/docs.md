# Noridoc: adapters/voice

Path: @/adapters/voice

### Overview

- The `VoiceRecorder` port (ENG-244, PRD v2 §8.7 + decision O5): records the listener's voice answers in the Mapeamento conversation as one WebM/Opus file per question, exposes a live input level for the waveform bars, plays a recorded answer back, and supports re-record (overwrite) + delete.
- Each answer is a single file keyed by its **canonical `respostas/level{1,2,3}/…/<k>.webm` path** (PRD §10.4). @/adapters/voice/path.ts is the sole `AnswerSlot → ResourcePath` point, reusing domain's builder and validating against the contract schema.
- Ships a headless deterministic fixture, a real MediaRecorder implementation, an in-memory persistence store, and a self-registering `register.ts`, following the same shape as @/adapters/audio and @/adapters/connectivity (see @/adapters/docs.md).

### How it fits into the larger codebase

- Per @/.dependency-cruiser.cjs this folder may import @/domain and @/contracts but never `ui/`; only the wiring layer resolves the port, and only by the name `'voice'` — never by importing an implementation class.
- **Reuses inner layers instead of reinventing paths:** @/adapters/voice/path.ts calls domain's `voiceAnswerPath` (@/domain/mapping.ts) to build the string and validates it with contracts' `ResourcePathSchema` (@/contracts/api.ts). The three shapes are `respostas/level1/<k>.webm`, `respostas/level2/<part_id>/<k>.webm` (part_id = `PT#`), and `respostas/level3/<prop_id>/<k>.webm` (prop_id = `P#`).
- **Persistence is decoupled behind `VoiceResourceStore`** (@/adapters/voice/types.ts). In production the Conversa/Mapeamento station (ENG-249) binds a store backed by @/adapters/sessions scoped to the ACTIVE session (`putResource`/`getResource`/`listResources`). SessionStore does not yet expose a resource `delete`, so the real per-session wiring (and `deleteResource`) is deferred to ENG-249; until then the registry's fixture and real modes are both born with a `MemoryVoiceStore` placeholder.
- @/adapters/voice/register.ts default-exports `{ port: 'voice', fixture, real }`; the composition root @/ui/app picks it up via `import.meta.glob('/adapters/*/register.ts')` (@/docs/architecture.md §4). **`real` is the default (ENG-298): recording for real IS the feature — the `.webm` answer is the artifact the Compilador consumes.** `fixture` activates only under `VITE_VOICE=fixture`, set for the jsdom test project (no MediaRecorder there). Do not confuse this with ENG-247: that one owns the _store_ (where the blob lands, over the API); capture needs no API at all.
- Recordings never leave the pipeline (PRD §12): no third-party sinks; bytes stay opaque (§10.5). Failures surface as the port's typed errors, not framework leakage.

### Core Implementation

- **Port** (@/adapters/voice/types.ts): `VoiceRecorder` = `start(path) → Recording`, `play(path)`, `stopPlayback()`, `has(path)`, `delete(path)`, `duration(path)` (seconds of a SAVED recording — throws if absent; ENG-271, feeds the report voice line §6.6/§8.7). A `Recording` handle carries `onLevel(cb)` (waveform level 0..1, emits during recording only), `stop() → RecordedAnswer` (`{blob, durationSec}`, persists), and `cancel()` (discards without persisting). Also defines `VoiceResourceStore`, `RecordedAnswer`, and the typed errors `VoiceUnsupportedError` / `MicPermissionError`.
- **`FixtureVoiceRecorder`** (@/adapters/voice/fixture.ts, the test double — NOT the app default since ENG-298): headless, with no `getUserMedia`/`MediaRecorder`. Levels come from a deterministic LCG (same family as the golden harness generator) advanced by a test-only `tick()` hook on `FixtureRecording`; `stop` persists a small static WebM placeholder blob. `duration(path)` reports the saved recording's length from the fixture clock (frame count × 0.1 s, recorded per path on `stop`); the real recorder decodes the stored bytes via an injected `AudioContext.decodeAudioData`. Its `start` returns the narrowed `FixtureRecording` so tests can reach `tick()`, while the port type stays `Recording`.
- **`WebVoiceRecorder`** (@/adapters/voice/web.ts, real): records `audio/webm;codecs=opus` over MediaRecorder + Web Audio. Feature-detects via `isTypeSupported` (throws `VoiceUnsupportedError`); a `getUserMedia` rejection becomes `MicPermissionError`; an `AnalyserNode` RMS loop meters the level while recording; playback runs through an `<audio>` element. Exports the mime as `VOICE_MIME`.
- **`MemoryVoiceStore`** (@/adapters/voice/memory-store.ts): a `Map` keyed by canonical path; `put` overwrites (re-record replaces); defensive byte copies on in/out (opaque custody, §10.5). Default store for the fixture and the tests.
- **`register.ts`** wires the port: `fixture: () => new FixtureVoiceRecorder()`, `real: () => new WebVoiceRecorder({ store: new MemoryVoiceStore() })`.

### Things to Know

- **All platform dependencies of the real recorder are constructor-injectable** (`getUserMedia`, the `MediaRecorder` ctor, `isTypeSupported`, the `AudioContext` ctor, `createAudio`), so node unit tests exercise the unsupported/permission error paths and the stop→persist path with no real mic; full jsdom/browser flows still belong to `ui/` tests.
- **Re-record is an overwrite:** `put` on the same canonical path replaces the prior answer — the invariant that one question maps to exactly one file lives in the store, and callers rely on it (PRD §8.7).
- **`MemoryVoiceStore` is a placeholder**, not the production sink. The real per-session `VoiceResourceStore` binding (and SessionStore `deleteResource`) is a deliberate ENG-249 follow-up; do not treat the in-memory store as the persistence contract.
- The fixture's determinism is deliberate: levels and the placeholder blob are stable so tests and any harness-adjacent checks agree byte-for-byte.
- **Fixture `duration` has an in-memory ceiling:** the `path → seconds` map is populated on `stop()` and lives per recorder instance, so a recording persisted by an EARLIER instance (e.g. across a session resume with a fresh fixture) reports `0` — the placeholder blob carries no timing to recover. The real `WebVoiceRecorder` decodes the stored bytes each call, so it survives reload; this is a fixture-only "unknown → 0" degradation, matching the web branch's "no Web Audio → 0".
- `register.ts` re-declares a local `AdapterRegistration<TPort>` shape matching @/adapters/audio and @/adapters/connectivity; the composition-root registry consumes the `{ port, fixture, real }` contract by name.

Created and maintained by Nori.
