# Noridoc: adapters

Path: @/adapters

### Overview

- Every outer dependency of the app lives here behind a **port**: an interface + a real implementation + a **fixture implementation that is the default**. The port set covers audio decode/playback, connectivity, API/auth, sessions, bucket audio, granularity, voice recording, and TTS (issues ENG-217, ENG-224, ENG-239, ENG-240, ENG-241/242, ENG-244, ENG-251).
- First concrete adapter landed: @/adapters/audio (see @/adapters/audio/docs.md) — the `AudioEngine` port with real Web Audio and headless fixture modes. Each remaining adapter issue adds its own subfolder following the same shape (convention README: @/adapters/README.md).
- Exists so the full app — and every UI/E2E test — runs with **no real API at all**; the real mode activates later via environment config (ENG-247, needs-human).

### How it fits into the larger codebase

- May import @/domain and @/contracts; **never** `ui/`. Inside `ui/`, only `pages`/`templates`/`app` (the wiring layer) may import adapters. Both directions enforced by @/.dependency-cruiser.cjs.
- **`register.ts` convention** (the loop's no-file-conflict guarantee, @/docs/architecture.md §4): each adapter self-registers its port name + fixture/real factories in its own `register.ts`; the composition root in @/ui/app picks them all up via `import.meta.glob('/adapters/*/register.ts')`. Landing an adapter = adding files, never editing a shared registry. The first concrete `register.ts` is @/adapters/audio/register.ts, which also currently hosts the `AdapterRegistration<T>` interface (ENG-224's composition root may hoist it).
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
  - `GranularityResolver` — acousteme → bead duration. The real rule is **pending open item O8** (PRD §15.2); the stub returns fixture values (medium ≈ 0.25 s). Never invent the derivation.
  - `AuthProvider` — **implemented** (@/adapters/api, see @/adapters/api/docs.md): targets the shared API's existing JWT scheme (python-jose Bearer); introduces no scheme of its own; token lives in memory (+ refresh), never localStorage; auth expiry (401) fires an `onAuthExpired` event **once** and must **not** clear app state on re-login. Ships beside it the `ApiClient` port (injected-`fetch` transport with Bearer injection + JSON error envelope → `ApiError`) that the real adapters build on. Resolved port name: `auth`.
  - `BucketSource` — the **only** MVP audio source (PRD §7.4): lists entries with duration, consent flag, and acousteme envelope; fetches raw bytes.
  - `SessionStore` — **implemented** (@/adapters/sessions, see @/adapters/sessions/docs.md): debounced full-state autosave that pauses offline and flushes on reconnect; `complete()` stores the three artifacts as **opaque** payload (never re-serialized — byte-identity rule, PRD §10.5); advisory editor lock; keyed blob resources for the `respostas/*.webm` voice answers.
  - Also port-shaped: `ConnectivityMonitor`, `VoiceRecorder` (WebM/Opus per question key), `SpeechSynthesizer` (optional — its absence hides the "Ouvir a pergunta" affordance).

### Things to Know

- **Fixture is the default mode.** Do not gate app behavior on a real backend existing; a missing port is a hidden affordance, not an error.
- Never hardcode behavior behind a stub port — especially granularity, which is blocked on O8. Issues carrying `blocked-O8` are ineligible for the loop.
- Testing: fixture-driven unit tests in the Vitest `unit` (node) project; no numeric coverage gate for this layer, but `register.ts` files are excluded from coverage (@/vitest.config.ts). Real-platform smoke tests (Web Audio, MediaRecorder) may live beside the adapter behind feature detection — they skip in node CI with the reason encoded in the test name (pattern set by @/adapters/audio/web-audio.test.ts); full jsdom/browser flows still belong to `ui/` browser tests.
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).
- Web-platform gotchas belong here, isolated behind the port: decode failures, MediaRecorder codec support, connectivity flapping. Failures should surface through the port's contract, not leak framework errors upward.

Created and maintained by Nori.
