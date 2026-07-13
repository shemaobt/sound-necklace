# Noridoc: storyteller-guide

Path: @/ui/organisms/storyteller-guide

### Overview

- The human figure that guides the listener through the Mapeamento conversation (PRD §6.6, §8.7): it must read as a **real, warm person** — looking at you, breathing, blinking, and moving its mouth while the question is spoken. Explicitly not abstract, not geometric.
- Ships as **interchangeable variants** picked at build time from `variants/*.tsx`, richest first: `lottie` → `animated` → `static`. Adding a variant is add-a-file; nothing else changes.
- The figure is presentational. It never knows about voice, sessions, or adapters — it receives a single `speaking` boolean.

### How it fits into the larger codebase

- @/ui/organisms/conversation-stage embeds it and forwards `speaking`. That boolean is the **real** speech state, sourced from the `onSpeaking` transitions of the `SpeechSynthesizer` port (@/adapters/tts) via @/ui/pages/mapeamento — it is the utterance's own `start`/`end`, not a guess. Before ENG-280 it was wired to `recorderState === 'idle'`, which meant the guide moved its mouth in silence; if you ever see the mouth animating with no voice, that coupling has regressed.
- `pickVariantPath` (`variant.ts`) declares the INTENT (prefer Lottie). The actual figure that renders depends on whether the art exists — see the asset contract below. This is deliberate: art is a design decision and must not hold the code hostage.

### Core Implementation

- **The asset contract.** Drop one Lottie `.json` into `variants/assets/`. It is picked up by an eager glob (`lottie-asset.ts`) — no import to write, no registry to edit. With no file there, `lottie.tsx` returns the CSS `animated` guide, so the app always has a guide and CI is green without the art.
- **Ideal asset shape:** markers named `idle` and `talk`. The variant then plays only the `talk` segment while the voice is speaking and the `idle` segment otherwise, so the mouth moves _only_ during speech. If the asset is a single baked loop with no markers, the variant degrades sensibly: it plays the whole loop while speaking and freezes on frame 0 (mouth closed) in silence.
- **`lottie-web` is imported dynamically, and that is load-bearing.** The library touches `canvas.getContext('2d')` at module scope; under jsdom that returns `null` and it throws. Because the variant glob is eager, a static import would break every test that renders the guide — including conversation-stage and mapeamento, which have nothing to do with Lottie. The dynamic import also keeps ~250 KB out of the bundle while there is no asset.
- The `animated` variant (ENG-232) is pure CSS: bob, blink, and a mouth keyed off the `data-speaking` attribute. It already delivers mouth/eyes/body motion, which is why it is a real fallback and not a placeholder.

### Things to Know

- **`prefers-reduced-motion` does not reach Lottie for free.** Every other animation in this app is guarded by a CSS `@media` block; Lottie draws from JS and ignores it entirely. `lottie.tsx` checks `matchMedia` explicitly and freezes on the first frame. Remove that check and the figure will move for precisely the users who asked for stillness.
- **The guide must never animate in silence.** `autoplay` is `false` on load; motion starts only when `speaking` becomes true. A guide gesturing with no voice reads as broken, and to a listener from an oral culture it is worse than a static figure.
- The header sound toggle gates the voice upstream (in the station), so when sound is off the guide simply never receives `speaking: true` — there is no separate mute path here to keep in sync.
- Per @/CLAUDE.md's sacrifice order, the animated guide and TTS are the FIRST things to cut under time pressure ("a static human figure is acceptable"). The variant mechanism is what makes that cut cheap: delete a file, the next variant down takes over.

Created and maintained by Nori.
