# Noridoc: adapters/tts

Path: @/adapters/tts

### Overview

- The `SpeechSynthesizer` port (PRD v2 §8.7 + redesign O2, **closed**): speaks each Mapeamento question aloud to back the "Ouvir a pergunta" button, in the language the UI is showing.
- **The voice is ElevenLabs, and it comes from our API** (ENG-284). The real implementation POSTs the question to the platform's shared TTS service (`POST /api/platform/tts/speak`, ENG-283 in `tripod-api`), which synthesizes it and caches it durably. The SPA **never** contacts ElevenLabs — no third party sits in the session's data path (PRD v2 §12).
- **Web Speech is now the fallback, not the baseline.** If the API is unreachable, not yet deployed, or errors, the real implementation delegates to the browser's own synthesis so the guide never goes mute.
- Ships a headless deterministic fixture (the default in tests), the HTTP implementation, the Web Speech fallback, and a self-registering `register.ts`, following the same shape as @/adapters/audio, @/adapters/connectivity, and @/adapters/voice (see @/adapters/docs.md).

### How it fits into the larger codebase

- Per @/.dependency-cruiser.cjs this folder may import @/domain and @/contracts but never `ui/`; only the wiring layer resolves the port, and only by the name `'tts'` — never by importing an implementation class.
- @/adapters/tts/register.ts default-exports an `AdapterRegistration` **unconditionally**. It used to export `null` when the Web Speech API was missing (the graceful-absence mechanism) — that is gone: with the voice coming from the API, a browser without `speechSynthesis` would have lost the ElevenLabs clips too, which is backwards. The mechanism still exists in the composition root (`buildAdapterRegistry` guards with `mod.default?.port`); this port simply no longer uses it, and degrades **internally** instead.
- **`onSpeaking` feeds the guide lip-sync:** the `speaking` true/false transitions drive the animated storyteller guide (ENG-232) in the conversation stage. Both the clip player and the fallback funnel into the same emitter, so the guide's mouth follows whichever one is actually speaking.
- No third-party sinks, no telemetry. The AI-voice disclosure required by §12 lives on the Setup screen (`setup.aiVoiceNotice`), not here.

### Core Implementation

- **Port** (@/adapters/tts/types.ts): `SpeechSynthesizer` = `speak(text, lang?)` (cancels any in-flight speech first), `stop()`, and `onSpeaking(cb) → Unsubscribe` (`true` at speech start, `false` at end/cancel). **The port did not change when the voice did** — which is why `ui/`, the fixture, and the Mapeamento tests were untouched by ENG-284.
- **`HttpSpeechSynthesizer`** (@/adapters/tts/http.ts, real): `POST {baseUrl}/platform/tts/speak` with `{text, language}` and a Bearer token → raw `audio/mpeg` → `URL.createObjectURL` → `HTMLAudioElement`. Shaped exactly like @/adapters/bucket/http.ts (injected `fetch`, optional token getter, binary body) — deliberately **not** routed through `ApiClient`, which always parses the body as JSON.
- **`FixtureSpeechSynthesizer`** (@/adapters/tts/fixture.ts, the DEFAULT in tests): fully headless. Records spoken texts in order (the `spoken` getter is a test hook) and emits the start/end transitions deterministically.
- **`WebSpeechSynthesizer`** (@/adapters/tts/web.ts, now the FALLBACK): over the Web Speech API. Sets `utterance.lang`, cancels prior speech before each `speak`, reflects `start`/`end`/`error` into the speaking state. Its `speechSynthesisSupported()` feature-detect went with the graceful-absence gate that used to call it — nothing branches on the API's presence any more; the class simply no-ops without it.
- **`register.ts`**: `fixture: () => new FixtureSpeechSynthesizer()`, `real: () => new HttpSpeechSynthesizer({ …, fallback: new WebSpeechSynthesizer() })`. Real `baseUrl`/token injection is ENG-247; until then it points at `/api` like its siblings.

### Things to Know

- **Autoplay is the trap, and it is new.** `speechSynthesis` spoke without a user gesture; `HTMLAudioElement.play()` **rejects** with `NotAllowedError` when there is none. The question is auto-spoken on arrival, so a hard reload straight onto a Mapeamento URL has no user activation and the first clip would die silently. The rejection is caught and simply reported as "not speaking" — it does **not** fall back to Web Speech (which is subject to the same policy, and it is not the API's fault). The "Ouvir a pergunta" button is a gesture, so it always works.
- **The `#apiDown` latch exists so a dead endpoint costs one request, not 21 — and it latches ONLY on a structural absence.** A **404/501** means the endpoint does not exist (dev with no backend, API not deployed) and will not start existing mid-session → every later question goes straight to the fallback. Everything else is transient and does **not** latch: a network error, a 401, a 500, an aborted body all fall back for _this_ question and try the API again on the next. This distinction is load-bearing — latching on a network error would mean a 5-second Wi-Fi blip silently degrades the guide's voice for the rest of the interview, on an app that is online-only and expects the connection back.
- **`#load` never rejects; `null` means "it didn't work".** `res.blob()` can fail _after_ a truthy `res.ok`, and the continuation in `speak()` is a fire-and-forget `.then()` — a throw there would surface as an unhandled rejection and the guide would go mute **without** falling back, which is the one outcome the fallback exists to prevent.
- **A decode failure falls back; an autoplay block does not.** Both end in silence, but only one is the API's fault. If `<audio>` errors on bytes the API served with a `200` (a proxy returning `index.html`, a truncated body), the clip is dropped from the cache and the fallback speaks — otherwise the guide would stay **mute for the whole interview**, which is precisely what the fallback exists to prevent, and the bad clip would be cached so even re-listening would not recover.
- **A stale clip must never play — and a stale clip's _error_ must never speak.** Each `speak()` takes a generation number, so a response that lands after the listener has advanced is discarded; and every `<audio>` handler is guarded by `#audio === audio`, so an abandoned element firing `error` late cannot make the guide say the **previous** question.
- **The wiring is LIVE.** @/ui/app/App.tsx resolves the `'tts'` port and hands it to the Conversa station (@/ui/pages/mapeamento), which speaks the question on arrival, re-speaks it from the button, and feeds `onSpeaking` into the guide's lip-sync. Unlike the other adapters, the shell resolves the **real** implementation, not the fixture — a guide that does not actually speak is not the feature.
- **`speak()` takes the language, and it is not decoration.** The spoken text is the DISPLAYED question, so an EN UI must speak EN (@/ui/i18n/mapeamento-questions.ts). The locale travels to the API as a full BCP-47 tag (`pt-BR`/`en-US`) and the API maps it to a **native voice per language** — a single multilingual voice was rejected because it carries its accent across languages. In the Web Speech fallback, `#pickVoice` matches the requested language and returns `undefined` rather than borrowing another one's voice.
- **The sound toggle is a consent gate, not a preference.** When `muted`, the station never calls `speak()` and the affordance is not rendered at all. The guide must never speak at a listener who did not ask for it.
- **Clips are cached per `(lang, text)` for the tab's lifetime** and the object URLs are never revoked — bounded on purpose, because the 21 questions are frozen strings (`domain/mapeamento-scripts.ts`). If the spoken text ever stops being a closed set, revoke on LRU eviction.
- **Known ceiling (fallback only):** no keep-alive for Chrome's ~15s cut-off on long utterances. Only reachable when the API is down.
- **Platform dependencies of both real classes are constructor-injectable** (`fetch`/`AudioCtor`/`createObjectURL`; `synth`/`UtteranceCtor`), so node unit tests exercise everything with no network and no DOM.
- **Cancel-before-speak is the invariant** in every mode: one question speaks at a time.

Created and maintained by Nori.
