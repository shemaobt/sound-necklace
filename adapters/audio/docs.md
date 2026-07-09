# Noridoc: adapters/audio

Path: @/adapters/audio

### Overview

- The app's single audio engine (ENG-217) behind the `AudioEngine` port (@/adapters/audio/types.ts): `decode(bytes)` turns raw audio into `DecodedAudio`, `createPlayer(decoded, beadSec)` yields the `Player` used by every station that plays sound.
- The playback core (@/adapters/audio/player.ts) is a 1:1 behavioral port of the v1 reference's play/toggle/stop/progress/edge logic in @/docs/reference/index.html. It is backend-agnostic: audio output and the clock are injected via a `PlaybackTransport`, so the exact same core runs in real and fixture modes.
- First concrete adapter in the codebase — it set the precedent for the port + real + fixture + `register.ts` shape described in @/adapters/docs.md.

### How it fits into the larger codebase

- `DecodedAudio.pcm` is typed as `PcmLike` from @/domain — the same interface `hashPCM` (manifest_id) and the bead-grid math consume. Decode output feeds the domain directly; the player also calls the domain's `buildBeads`/`beadAtTime`, keeping bead indices as the universal coordinate.
- Consumed by `ui/` only through props/wiring (pages/templates/`ui/app`); the adapter never knows UI. Decode failures surface as the typed `AudioDecodeError` — the Setup station owns the PT-BR error copy (PRD §8.1).
- @/adapters/audio/register.ts is the first live instance of the add-a-file registration convention (@/docs/architecture.md §4): it default-exports `{ port: 'audio', fixture, real }`. The `AdapterRegistration<T>` interface currently lives in this file; the ENG-224 composition root will glob `adapters/*/register.ts` and may hoist the type.
- @/adapters/audio/fixture.ts imports the golden harness's synthetic-PCM generator @/tests/golden/pcm.ts (sanctioned by the issue; @/.dependency-cruiser.cjs bans `tests/` imports only for `domain/` and `contracts/`). This makes fixture-mode audio byte-identical to what the harness hashes.

```
bytes ──decode()──▶ DecodedAudio { duration, pcm: PcmLike } ──▶ domain hashPCM / buildBeads
                        │ createPlayer(decoded, beadSec)
                        ▼
              player.ts (core, 1:1 reference port)
                        │ PlaybackTransport {now, start, suspend, resume, frames}
             ┌──────────┴───────────┐
             ▼                      ▼
      web-audio.ts             fixture.ts
  (AudioContext + rAF)   (manual-advance fake clock)
```

### Core Implementation

- Player semantics (all from the reference; @/adapters/audio/player.ts):
  - **Single-playback invariant** — any new `play`/`toggle`/`playEdge` first stops whatever is playing.
  - **Toggle** — same key pauses/resumes via transport `suspend`/`resume` (the context clock freezes, so head progress halts by itself); a different key switches track. Direct `play` (bead/selection clicks) carries no key and no pause affordance.
  - **Duration floor** — scheduled length is `max(0.02, t1 - t0)` seconds.
  - **Head progress** — a frame loop maps context time to a bead index via `beadAtTime`, emits to `onHead` listeners only when the bead changes, and emits `null` when playback ends or stops.
  - **Edge window** — `playEdge` plays `max(1, round(1/beadSec))` beads on each side of a boundary, clamped to the grid (the "~1 s around the seam" rule).
- @/adapters/audio/web-audio.ts (real mode): lazy `AudioContext` (constructing the engine never touches audio); `decodeAudioData(bytes.slice(0))` because the Web Audio spec detaches the input buffer; a fresh `AudioBufferSourceNode` per play since nodes are one-shot; decode failures wrapped in `AudioDecodeError` with `cause`.
- @/adapters/audio/fixture.ts (default mode): `decode` accepts JSON-encoded `PcmSpec` bytes (helper `pcmSpecBytes`) and synthesizes PCM with the golden LCG; `duration = samples / sampleRate`. `FixtureTransport.advance(dt)` moves time only while not suspended, fires due/stopped `onEnded` callbacks, then runs one frame batch — tests drive playback deterministically.
- @/adapters/audio/index.ts is the public barrel for the wiring layer and tests; app code resolves the engine via the `audio` port, not by importing implementations.

### Things to Know

- **The onended guard is load-bearing:** real Web Audio delivers a stopped node's `onended` asynchronously, so a discarded node's late event must not clear the playback that replaced it. The core compares handles before clearing state, and `FixtureTransport` deliberately mimics the async delivery (a stop's `onEnded` fires on the _next_ `advance`) so tests exercise the same race.
- Fixture `decode` bytes are **not audio** — they are a JSON `PcmSpec`. Malformed JSON or out-of-range fields reject with `AudioDecodeError`, same typed surface as real decode failures.
- The fixture's `getChannelData` returns the same LCG array for every channel; that is fine because the domain's `hashPCM` only ever reads channel 0.
- Pause is `AudioContext.suspend()` on the whole context, not per-node — exactly what the reference does; do not "improve" this, byte/behavior fidelity to @/docs/reference/index.html is the requirement.
- `WebAudioEngine.createPlayer` requires a `DecodedAudio` produced by its own `decode` (the pcm must be a real `AudioBuffer`); mixing engines across decode/play throws.
- Tests: the core and fixture are fully tested in the node `unit` project via `FixtureTransport`; real Web Audio smoke tests in @/adapters/audio/web-audio.test.ts sit behind feature detection (`it.skipIf` when `AudioContext` is absent) and show as skipped in node CI with the reason encoded in the test name — only the lazy-construction test always runs.

Created and maintained by Nori.
