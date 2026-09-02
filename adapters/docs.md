# Noridoc: adapters

Path: @/adapters

### Overview

- Every outer dependency of the app lives here behind a **port**: an interface + a real implementation + a **fixture implementation that is the default**. The port set covers audio decode/playback, connectivity, API/auth, sessions, bucket audio, granularity and **project settings**. The voice recording, TTS and speech-to-text/translation-draft ports (`adapters/voice`, `adapters/tts`, `adapters/stt`) existed for the interview and were deleted with it in ENG-689 (scope cut 1/4).
- First concrete adapter landed: @/adapters/audio (see @/adapters/audio/docs.md) — the `AudioEngine` port with real Web Audio and headless fixture modes. Each remaining adapter issue adds its own subfolder following the same shape (convention README: @/adapters/README.md).
- Exists so the full app — and every UI/E2E test — runs with **no real API at all**; the real mode is selected per adapter by the composition root under `VITE_API_MODE=real` (ENG-247, @/ui/app/api-config.ts) — fixture stays the default.

### How it fits into the larger codebase

- May import @/domain and @/contracts; **never** `ui/`. Inside `ui/`, only `pages`/`templates`/`app` (the wiring layer) may import adapters. Both directions enforced by @/.dependency-cruiser.cjs.
- **`register.ts` convention** (the loop's no-file-conflict guarantee, @/docs/architecture.md §4): each adapter self-registers its port name + fixture/real factories in its own `register.ts`; the composition root in @/ui/app picks them all up via `import.meta.glob('/adapters/*/register.ts')`. Landing an adapter = adding files, never editing a shared registry. The first concrete `register.ts` is @/adapters/audio/register.ts, which also currently hosts the `AdapterRegistration<T>` interface (ENG-224's composition root may hoist it). Ports that need shared state or injected real config (auth, sessions, bucket) are additionally wrapped by mode-aware app-global singletons in @/ui/app (`appAuth()`, `appSessionStore()`, `appBucket()`) — that wiring, not the registry, is where the real implementations receive baseUrl/token/user.
- Fixture implementations draw their data from @/fixtures (bucket WAVs + acousteme envelopes, ready-made session states); the audio fixture synthesizes PCM with the deterministic generator at @/adapters/audio/pcm.ts (see @/adapters/audio/docs.md) so fixture-mode audio and its hashes are reproducible. That generator lived at `tests/golden/pcm.ts` until ENG-691 moved it here — it was never really harness code, it is the fixture-mode audio, and the golden harness that used to also read it is gone.

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
  - `SessionStore` — **implemented** (@/adapters/sessions, see @/adapters/sessions/docs.md): debounced full-state autosave that pauses offline and flushes on reconnect; advisory editor lock. `complete()` and the keyed blob resources for `respostas/*.webm` voice answers are still in this frozen layer (untouched by ENG-689) even though nothing in `ui/` reaches them today — the app now stops at Rever (@/ui/pages/review, ENG-725) and still never calls `complete()`; that slice deliberately does not mark a session concluded server-side either (ENG-702).
  - Also port-shaped: `ConnectivityMonitor`.

### Things to Know

- **Fixture is the default mode.** Do not gate app behavior on a real backend existing; a missing port is a hidden affordance, not an error.
- **A `real()` may legitimately throw** when the API job it depends on is not built yet — refusing loudly beats guessing an endpoint shape that would later have to be un-guessed. `@/adapters/stt` used to be the example of this (fixture-only, `real()` throwing until ENG-325); it left the repo with the interview in ENG-689, but the pattern remains available to a future adapter in the same spot.
- Never hardcode behavior behind a port — resolve it through the interface (fixture or real). Granularity's O8 derivation rule is now resolved (ENG-242), so its resolver reads the acousteme envelope's `granularity_frames`/`hop_sec` directly; it is no longer a stub.
- Testing: fixture-driven unit tests in the Vitest `unit` (node) project; no numeric coverage gate for this layer, but `register.ts` files are excluded from coverage (@/vitest.config.ts). Real-platform smoke tests (Web Audio, MediaRecorder) may live beside the adapter behind feature detection — they skip in node CI with the reason encoded in the test name (pattern set by @/adapters/audio/web-audio.test.ts); full jsdom/browser flows still belong to `ui/` browser tests.
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).
- Web-platform gotchas belong here, isolated behind the port: decode failures, MediaRecorder codec support, connectivity flapping. Failures should surface through the port's contract, not leak framework errors upward.

Created and maintained by Nori.
