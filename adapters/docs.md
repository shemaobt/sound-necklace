# Noridoc: adapters

Path: @/adapters

### Overview

- Every outer dependency of the app lives here behind a **port**: an interface + a real implementation + a **fixture implementation that is the default**. Planned adapters cover audio decode/playback, connectivity, API/auth, sessions, bucket audio, granularity, voice recording, and TTS (issues ENG-217, ENG-224, ENG-239, ENG-240, ENG-241/242, ENG-244, ENG-251).
- Currently only the convention README (@/adapters/README.md); each adapter issue adds its own subfolder.
- Exists so the full app — and every UI/E2E test — runs with **no real API at all**; the real mode activates later via environment config (ENG-247, needs-human).

### How it fits into the larger codebase

- May import @/domain and @/contracts; **never** `ui/`. Inside `ui/`, only `pages`/`templates`/`app` (the wiring layer) may import adapters. Both directions enforced by @/.dependency-cruiser.cjs.
- **`register.ts` convention** (the loop's no-file-conflict guarantee, @/docs/architecture.md §4): each adapter self-registers its port name + fixture/real factories in its own `register.ts`; the composition root in @/ui/app picks them all up via `import.meta.glob('/adapters/*/register.ts')`. Landing an adapter = adding files, never editing a shared registry.
- Fixture implementations draw their data from @/fixtures (bucket WAVs + acousteme envelopes, ready-made session states).

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
  - `GranularityResolver` — acousteme → bead duration. The real rule is **pending open item O8** (PRD §15.2); the stub returns fixture values (medium ≈ 0.25 s). Never invent the derivation.
  - `AuthProvider` — targets the shared API's existing JWT scheme (python-jose Bearer); introduces no scheme of its own; auth expiry must **not** clear app state on re-login.
  - `BucketSource` — the **only** MVP audio source (PRD §7.4): lists entries with duration, consent flag, and acousteme envelope; fetches raw bytes.
  - `SessionStore` — debounced full-state autosave that pauses offline and flushes on reconnect; `complete()` receives the three artifacts as **opaque bytes** (never re-serialized — byte-identity rule, PRD §10.5); advisory editor lock; keyed blob resources for the `respostas/*.webm` voice answers.
  - Also port-shaped: `AudioEngine`, `ConnectivityMonitor`, `VoiceRecorder` (WebM/Opus per question key), `SpeechSynthesizer` (optional — its absence hides the "Ouvir a pergunta" affordance).

### Things to Know

- **Fixture is the default mode.** Do not gate app behavior on a real backend existing; a missing port is a hidden affordance, not an error.
- Never hardcode behavior behind a stub port — especially granularity, which is blocked on O8. Issues carrying `blocked-O8` are ineligible for the loop.
- Testing: fixture-driven unit tests in the Vitest `unit` (node) project; no numeric coverage gate for this layer, but `register.ts` files are excluded from coverage (@/vitest.config.ts). jsdom/browser concerns (Web Audio, MediaRecorder) belong to `ui/` browser tests, not here.
- Fixture-safe adapter PRs may merge autonomously on green (unlike @/domain and @/contracts).
- Web-platform gotchas belong here, isolated behind the port: decode failures, MediaRecorder codec support, connectivity flapping. Failures should surface through the port's contract, not leak framework errors upward.

Created and maintained by Nori.
