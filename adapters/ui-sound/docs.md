# Noridoc: adapters/ui-sound

Path: @/adapters/ui-sound

### Overview

- The interface's own voice, behind the `UiSound` port (@/adapters/ui-sound/types.ts): the app is ear-first, so a decision should be **audible** without reading anything. Ported from the prototype's `_blip`/`_chime`/`_lock` vocabulary (@/docs/design/prototype.html).
- Synthesized oscillator tones only — no audio files, no network, no content. Nothing here speaks, names, or interprets the story: the "no AI-generated content" rule (@/CLAUDE.md) is untouched.
- Real mode (@/adapters/ui-sound/web-audio.ts) drives Web Audio oscillators; the fixture (@/adapters/ui-sound/silent.ts) plays nothing, so unit and e2e suites run mute without knowing this adapter exists.

### The vocabulary

Each voice means one thing, and they are meant to be told apart by ear:

| Method                           | Tone                         | Fires on                                                                   |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `lock()`                         | 300 Hz triangle              | a decision is pinned: scene/phrase locked, "nenhum se encaixa", seam moved |
| `advance()`                      | 660 → 880 Hz sine, ascending | a station is finished (the prototype's `_chime`)                           |
| `refuse()`                       | 200 Hz sawtooth              | the action is not possible — short, never punitive (§9.4)                  |
| `tap()`                          | 560 Hz sine                  | small UI touches                                                           |
| `recordStart()` / `recordStop()` | 660 / 320 Hz                 | the interview's microphone                                                 |
| `saved()`                        | 680 Hz sine                  | a document was downloaded                                                  |

### What was deliberately NOT ported

- The prototype's `_pearlClick` — a tone per bead, fired on tap and every 4th bead **during playback**. The prototype has no story audio, so those beeps _are_ its stand-in for the story. Here the story plays for real: porting them would beep over the audio the whole app exists to make heard. A bead tap is already answered by the bead's own audio (PRD §8.2).

### Muting

- The header's sound toggle is honoured by **swapping the port**, not by `if (muted)` at each call site: the composition root (@/ui/app/App.tsx) hands stations `SilentUiSound` when muted. Before this adapter, that toggle only silenced the interview's TTS voice — it now silences everything the UI plays, which is what its label always promised.

### Wiring

- Stations receive `sound` through `stationProps` (@/ui/app/App.tsx), the same path as `player`. The prop is optional everywhere (`sound?.lock()`), so a station renders fine without it and tests opt in only when they assert the sound.

### Gotchas

- The `AudioContext` is created on **first use**, never at construction: browsers suspend a context created before a user gesture. A suspended context is resumed on each play.
- An environment with no Web Audio (jsdom) leaves the UI mute instead of throwing — the constructor's factory is wrapped in try/catch.
- `advance()` schedules its second note on the **audio clock** (`currentTime + 0.09`), not a `setTimeout` like the prototype: it keeps the interval exact and testable.
