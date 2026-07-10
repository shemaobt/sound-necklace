# Noridoc: adapters/tts

Path: @/adapters/tts

### Overview

- The `SpeechSynthesizer` port (ENG-251, PRD v2 §8.7 + redesign O2): speaks each Mapeamento question aloud in pt-BR to back the "Ouvir a pergunta" button. Synthesized pt-BR speech is the **MVP baseline**; pre-recorded human prompts are a post-MVP upgrade.
- The port is **optional and gracefully absent**: in an environment without the Web Speech API the port is never registered and the button stays hidden — not an error, just a missing affordance.
- Ships a headless deterministic fixture (the default), a real Web Speech implementation, and a self-registering `register.ts`, following the same shape as @/adapters/audio, @/adapters/connectivity, and @/adapters/voice (see @/adapters/docs.md).

### How it fits into the larger codebase

- Per @/.dependency-cruiser.cjs this folder may import @/domain and @/contracts but never `ui/`; only the wiring layer resolves the port, and only by the name `'tts'` — never by importing an implementation class.
- @/adapters/tts/register.ts default-exports `AdapterRegistration | null`. When `speechSynthesisSupported()` is false it exports `null`, so the composition root's `buildAdapterRegistry` (@/ui/app/registries.ts, which already guards with `mod.default?.port`) simply skips the `'tts'` port. This is the graceful-absence mechanism. The root harvests all registrations via `import.meta.glob('/adapters/*/register.ts')` (@/docs/architecture.md §4).
- **`onSpeaking` feeds the guide lip-sync:** the `speaking` true/false transitions drive the animated storyteller guide (ENG-232) in the conversation stage; the port exists so that state comes from the actual speech engine, not a timer.
- No third-party sinks, no telemetry; UI copy is PT-BR (PRD §12).

### Core Implementation

- **Port** (@/adapters/tts/types.ts): `SpeechSynthesizer` = `speak(text)` (speaks pt-BR, cancels any in-flight speech first), `stop()`, and `onSpeaking(cb) → Unsubscribe` (`true` at speech start, `false` at end/cancel).
- **`FixtureSpeechSynthesizer`** (@/adapters/tts/fixture.ts, the DEFAULT): fully headless, no Web Speech API. Records spoken texts in order (the `spoken` getter is a test hook) and emits the start/end transitions deterministically; speaking a new question emits `false` for the prior utterance before `true` for the new one.
- **`WebSpeechSynthesizer`** (@/adapters/tts/web.ts, real): over the Web Speech API. Sets `utterance.lang = 'pt-BR'`, cancels prior speech before each `speak`, and reflects the utterance `start`/`end`/`error` events into the speaking state. Also exports `speechSynthesisSupported(scope = globalThis)`, the `speechSynthesis` + `SpeechSynthesisUtterance` feature-detect that `register.ts` gates on.
- **`register.ts`** wires the port: `fixture: () => new FixtureSpeechSynthesizer()`, `real: () => new WebSpeechSynthesizer()` — or `null` when unsupported.

### Things to Know

- **Wiring is dormant.** The Conversa station (@/ui/pages/mapeamento) does not yet resolve the `'tts'` port nor pass `onSpeakQuestion`/`speaking` into the `ConversationStage` organism — the `StationHost` currently renders stations without props, exactly like the dormant recorder/player. Binding the button to the port is a follow-up (same dormant-until-setup path as the sibling stations), out of scope for ENG-251. Do not read this folder as already-live.
- **Voice selection is a documented fallback chain:** prefer a `pt-BR` voice, then any `pt-*` voice, then the system default. `lang` is normalized (`_`→`-`, lowercased) before matching, since platforms report either `pt_BR` or `pt-BR`.
- **Platform dependencies of the real class are constructor-injectable** (`synth`, `UtteranceCtor` via `WebSpeechDeps`), so node unit tests exercise `speak`/`stop`/`onSpeaking` with no real synthesis; in an environment where neither is present, `speak`/`stop` are no-ops.
- **Cancel-before-speak is the invariant** in both modes: one question is speaking at a time — starting a new one always ends the previous first.
- `register.ts` re-declares a local `AdapterRegistration<TPort>` shape matching the sibling adapters; the composition-root registry consumes the `{ port, fixture, real }` contract by name, and tolerates the `null` export.

Created and maintained by Nori.
