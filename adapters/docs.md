# Noridoc: adapters

Path: @/adapters

### Overview

- Every outer dependency of the app lives here behind a **port**: an interface + a real implementation + a **fixture implementation that is the default**. The port set covers audio decode/playback, connectivity, API/auth, sessions, bucket audio, granularity, voice recording, TTS, and speech-to-text/translation drafts.
- First concrete adapter landed: @/adapters/audio (see @/adapters/audio/docs.md) — the `AudioEngine` port with real Web Audio and headless fixture modes. Each remaining adapter issue adds its own subfolder following the same shape (convention README: @/adapters/README.md).
- Exists so the full app — and every UI/E2E test — runs with **no real API at all**; the real mode is selected per adapter by the composition root under `VITE_API_MODE=real` (ENG-247, @/ui/app/api-config.ts) — fixture stays the default.

### How it fits into the larger codebase

- May import @/domain and @/contracts; **never** `ui/`. Inside `ui/`, only `pages`/`templates`/`app` (the wiring layer) may import adapters. Both directions enforced by @/.dependency-cruiser.cjs.
- **`register.ts` convention** (the loop's no-file-conflict guarantee, @/docs/architecture.md §4): each adapter self-registers its port name + fixture/real factories in its own `register.ts`; the composition root in @/ui/app picks them all up via `import.meta.glob('/adapters/*/register.ts')`. Landing an adapter = adding files, never editing a shared registry. The first concrete `register.ts` is @/adapters/audio/register.ts, which also currently hosts the `AdapterRegistration<T>` interface (ENG-224's composition root may hoist it). Ports that need shared state or injected real config (auth, sessions, bucket) are additionally wrapped by mode-aware app-global singletons in @/ui/app (`appAuth()`, `appSessionStore()`, `appBucket()`) — that wiring, not the registry, is where the real implementations receive baseUrl/token/user.
- Fixture implementations draw their data from @/fixtures (bucket WAVs + acousteme envelopes, ready-made session states); the audio fixture additionally synthesizes PCM with the golden harness generator @/tests/golden/pcm.ts so fixture audio and harness hashes agree byte-for-byte (allowed: @/.dependency-cruiser.cjs bans `tests/` imports only for `domain/` and `contracts/`).

```
ui/app (composition root)
   │  import.meta.glob('/adapters/*/register.ts')
   ▼
adapters/<name>/register.ts ──▶ { port name, fixture factory (default), real factory }
   │
   ▼
ui/pages resolve ports by name; an absent port hides its affordance
```

### Core Implementation

- Port signatures the app codes against are recorded in @/docs/architecture.md §3. Highlights:
  - `AudioEngine` — **implemented** (@/adapters/audio): decode bytes → duration + domain `PcmLike` PCM, plus the reference-faithful player (toggle/pause, single playback, head progress, edge windows). Details in @/adapters/audio/docs.md.
  - `GranularityResolver` — **implemented** (@/adapters/granularity, see @/adapters/granularity/docs.md): resolves the level to `beadSec = granularity_frames[level] × hop_sec` from the audio's acousteme envelope (the now-closed O8 rule, PRD §15.2 / ENG-242). Audios without an acousteme fall back to the same uniform tokenizer grid (Pequena 0.20 / Média 0.50 / Grande 1.00 s); the resolver never invents the derivation.
  - `AuthProvider` — targets the shared API's existing JWT scheme (python-jose Bearer); introduces no scheme of its own; auth expiry must **not** clear app state on re-login.
  - `BucketSource` — **implemented** (@/adapters/bucket, see @/adapters/bucket/docs.md): the **only** MVP audio source (PRD §7.4). Lists entries with duration, consent flag, and acousteme envelope; fetches **opaque** audio bytes. Fixture bytes are `PcmSpec` JSON (what the fixture audio engine decodes); real HTTP serves WAV.
  - `SessionStore` — **implemented** (@/adapters/sessions, see @/adapters/sessions/docs.md): debounced full-state autosave that pauses offline and flushes on reconnect; `complete()` stores the three artifacts as **opaque** payload (never re-serialized — byte-identity rule, PRD §10.5); advisory editor lock; keyed blob resources for the `respostas/*.webm` voice answers.
  - `Transcriber` — **fixture only** (@/adapters/stt, see @/adapters/stt/docs.md): the async transcription + PT→EN translation job whose output is a **draft** a human confirms in the report. Its `real()` throws on purpose until the API job exists (ENG-325) — see Things to Know.
  - Also port-shaped: `ConnectivityMonitor`, `VoiceRecorder` (WebM/Opus per question key), `SpeechSynthesizer` (optional — its absence hides the "Ouvir a pergunta" affordance).

### Things to Know

- **Fixture is the default mode.** Do not gate app behavior on a real backend existing; a missing port is a hidden affordance, not an error.
- **A `real()` may legitimately throw.** @/adapters/stt ships fixture-only because the API job it depends on is not built yet; refusing loudly beats guessing an endpoint shape that would later have to be un-guessed. The composition root mounts the fixture explicitly, so nothing in the running app reaches the throw.
- Never hardcode behavior behind a port — resolve it through the interface (fixture or real). Granularity's O8 derivation rule is now resolved (ENG-242), so its resolver reads the acousteme envelope's `granularity_frames`/`hop_sec` directly; it is no longer a stub.
- Testing: fixture-driven unit tests in the Vitest `unit` (node) project; no numeric coverage gate for this layer, but `register.ts` files are excluded from coverage (@/vitest.config.ts). Real-platform smoke tests (Web Audio, MediaRecorder) may live beside the adapter behind feature detection — they skip in node CI with the reason encoded in the test name (pattern set by @/adapters/audio/web-audio.test.ts); full jsdom/browser flows still belong to `ui/` browser tests.
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).
- Web-platform gotchas belong here, isolated behind the port: decode failures, MediaRecorder codec support, connectivity flapping. Failures should surface through the port's contract, not leak framework errors upward.

Created and maintained by Nori.
