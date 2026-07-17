# Noridoc: storyteller-guide

Path: @/ui/organisms/storyteller-guide

### Overview

- The human figure that guides the listener through the Mapeamento conversation (PRD §6.6, §8.7): it must read as a **real, warm person** — looking at you, breathing, blinking, and moving its mouth while the question is spoken. Explicitly not abstract, not geometric.
- Ships as **interchangeable variants** picked at build time from `variants/*.tsx`, richest first: `lottie` → `animated`. Adding a variant is add-a-file; nothing else changes. (The old `static` variant was deleted in ENG-295: under reduced motion the `animated` variant already holds an intentional still pose, so a second diverging figure bought nothing.)
- The figure is presentational. It never knows about voice, sessions, or adapters — it receives a single `speaking` boolean.

### How it fits into the larger codebase

- @/ui/organisms/conversation-stage embeds it and forwards `speaking`. That boolean is the **real** speech state, sourced from the `onSpeaking` transitions of the `SpeechSynthesizer` port (@/adapters/tts) via @/ui/pages/mapeamento — it is the utterance's own `start`/`end`, not a guess. Before ENG-280 it was wired to `recorderState === 'idle'`, which meant the guide moved its mouth in silence; if you ever see the mouth animating with no voice, that coupling has regressed.
- `pickVariantPath` (`variant.ts`) declares the INTENT (prefer Lottie). The actual figure that renders depends on whether the art exists — see the asset contract below. This is deliberate: art is a design decision and must not hold the code hostage.

### Core Implementation

- **The asset contract.** Drop one Lottie `.json` into `variants/assets/`. It is picked up by an eager glob (`lottie-asset.ts`) — no import to write, no registry to edit. With no file there, `lottie.tsx` returns the CSS `animated` guide, so the app always has a guide and CI is green without the art.
- **Ideal asset shape:** markers named `idle` and `talk`. The variant then plays only the `talk` segment while the voice is speaking and the `idle` segment otherwise, so the mouth moves _only_ during speech. If the asset is a single baked loop with no markers, the variant degrades sensibly: it plays the whole loop while speaking and freezes on frame 0 (mouth closed) in silence.
- **`lottie-web` is imported dynamically, and that is load-bearing.** The library touches `canvas.getContext('2d')` at module scope; under jsdom that returns `null` and it throws. Because the variant glob is eager, a static import would break every test that renders the guide — including conversation-stage and mapeamento, which have nothing to do with Lottie. The dynamic import also keeps ~250 KB out of the bundle while there is no asset.
- The `animated` variant (ENG-232; figure redrawn in ENG-295) renders the **Avataaars** character (art by Pablo Stanley, generated via `@dicebear/core` + `@dicebear/collection` — the original `avataaars` React package is dead on React 19, it uses the removed legacy context API). The owner's customization lives in the `FIGURE` constant. The RDF `<metadata>` block is stripped from the SVG string so the figure's textContent stays digit-free (listener-screen rule); this doc is the art credit.
- **Swapping markup is what made the face mechanical — do not go back to it.** The first cut of ENG-295 swapped whole pre-rendered SVGs by state (and then just the mouth). Markup swaps do not interpolate: every change is a snap, and a face that snaps reads as a machine no matter how well the expressions are picked. So the SVG is built **once** (`FIGURE_SVG`), the component holds no state and no timers, and all motion is CSS the browser interpolates — the same technique as the design prototype (§11).
- **Both mouths live in the SVG at once.** `buildFigure()` grafts the open `smile` mouth into the same anchor group as the closed `twinkle` one; opacity picks which shows. That is what gives the browser something to interpolate when speech starts and stops — the last remaining snap before it.
- **The resting mouth is closed (`twinkle`).** A guide grinning open-mouthed in silence reads as frozen mid-word. `.cds-guide-mouth-talk { opacity: 0 }` sits _outside_ the motion guard, so it is also the `reduce` pose and the pre-voice initial state — without it the open mouth would sit gaping over the closed one for anyone who asked for stillness.
- **Motion is tied to the real voice, never to a free-running loop.** The mouth animates only under `[data-speaking='true']`; the eyebrows raise for the whole duration of speech and drop when it ends — the emphasis of someone asking a question. Looping them would read as a nervous tic, which is the exact impression ENG-295 exists to remove. Only the blink runs on a clock. The `cds-guide-talk` keyframes use deliberately **uneven** steps and start/end nearly closed: an even cycle reads as a metronome, and ending near the rest pose keeps the cross-fade landing on similar shapes.

### Animating a DiceBear SVG — two traps

- **There are no semantic ids.** Each face part is a `<g transform="translate(x y)">` at fixed coordinates (mouth `78 134`, eyes `76 90`, eyebrows `76 82`), stable across every eye/mouth/eyebrow variant. `ANCHORS` maps them to classes; the anchor test fails loudly if a DiceBear upgrade moves them, because otherwise the face would simply stop moving with no error at all.
- **Never put a CSS `transform` on the anchor group itself.** In SVG the `transform` attribute and the CSS `transform` property are the same thing — the CSS one wins and erases `translate(78 134)`, launching the mouth into the corner of the viewBox. `wrapContent()` therefore injects an _inner_ `<g class="…">`: translate stays on the parent, animation goes on the child. A test asserts the animated group carries no `transform` of its own.

### Things to Know

- **`prefers-reduced-motion` does not reach Lottie for free.** Every other animation in this app is guarded by a CSS `@media` block; Lottie draws from JS and ignores it entirely. `lottie.tsx` checks `matchMedia` explicitly and freezes on the first frame. Remove that check and the figure will move for precisely the users who asked for stillness.
- **The guide must never animate in silence.** `autoplay` is `false` on load; motion starts only when `speaking` becomes true. A guide gesturing with no voice reads as broken, and to a listener from an oral culture it is worse than a static figure.
- The header sound toggle gates the voice upstream (in the station), so when sound is off the guide simply never receives `speaking: true` — there is no separate mute path here to keep in sync.
- Per @/CLAUDE.md's sacrifice order, the animated guide and TTS are the FIRST things to cut under time pressure ("a static human figure is acceptable"). The variant mechanism is what makes that cut cheap: delete a file, the next variant down takes over.

Created and maintained by Nori.
