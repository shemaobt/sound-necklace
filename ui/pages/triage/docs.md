# Noridoc: triage

Path: @/ui/pages/triage

### Overview

- The scene-classification station (ENG-236): "Triage" (PRD v2 §8.5, redesign §6.4), where the facilitator + listener classify each locked scene against the Ruth ontology — **one scene in focus at a time**, navigated by progress dots that double as jump targets.
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders the @/ui/organisms `TriagePicker` and `CoverageDrawer`, and dispatches the pure triage/gate reducers.
- Each scene shows "▶ Ouvir esta cena" (plays the scene span), the current tag state always visible (por classificar / kind + confidence / ⌀ nenhum se encaixa), and the picker. Marking "nenhum se encaixa" is a **finding**, not a dead end.

### How it fits into the larger codebase

- **The station between @/ui/pages/cut and @/ui/pages/phrases.** Stations self-register through `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts), so the default export in `index.tsx` is mandatory — it is the registry value keyed by the directory name `triage`. @/ui/app/App.tsx maps `triage → triage` and renders this station when the session mode is `triage`.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import adapters, @/domain, @/ui/state and the ui component layers. The two organisms it consumes (`TriagePicker`, `CoverageDrawer`) are **not** in @/ui/organisms/index.ts (that barrel was frozen by ENG-225), so they are imported by direct path — the same sibling-direct-import pattern segmentação uses.
- Reads session state via `useSessionStore` and writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause a classify/none-fit without losing in-memory state.
- The gate hands the guided flow to Segmentação; the all-none-fit case leaves Segmentação/Conversation locked (`modeLocks`), so this station is the productivity gate into phrase work.
- The itinerant `Player` (@/adapters/audio) is injected by prop, not constructed here — same audio seam as the escuta stations (`player` defaults to `null`).

### Core Implementation

- **`Triage({ player })`** (@/ui/pages/triage/index.tsx): subscribes `session`; renders `null` until a session exists. A single `useMemo` keyed on `session` derives `{ parts: lockedParts, coverage: computeCoverage, gate: triageDone }` (stable ref between playback frames). Local React state holds `focusIdx` (the scene in focus) and `inspecting` (see the review moment below).
- **The review moment (`reviewing`, owner decision):** once `gate.enabled` (every locked part non-pending AND ≥1 productive) AND `inspecting === null`, the picker/instruction/▶-scene block is replaced by one headline (`triage.reviewHeadline`) plus one action (`review.continue`, shared with @/ui/pages/cut and @/ui/pages/phrases) that dispatches the same `advance`. The old hard gate button ("Já classifiquei todas as cenas →") no longer exists — only the gate's helper message survives, rendered under `!gate.enabled && gate.message`. Clicking a progress dot sets `inspecting` to that scene's index, which reopens the picker/instruction block for it (`reviewing` goes false) even though the gate stays enabled; classifying or marking none-fit on that scene resets `inspecting` to `null`, so the station falls back to reviewing on its own. The all-none-fit lockout is orthogonal: it fails `gate.enabled` (no productive scene), so it can never present as a review moment.
- **Progress dots** (@/ui/molecules `ProgressDots`): one per locked part, `current = focusIdx`, `onSelect` sets both `focusIdx` and `inspecting` to the clicked index — so jumping to any scene during a review moment reopens its picker. Digit-free (`aria-label="ir para a cena"`, `aria-current="step"` on the focused dot). Each dot's `scenes[i]` derives `state` from `part.tag_state` (`tagged`/`none_fit`/`pending`) and `tint` from `sceneColor(i)` (@/ui/pages/cut/cutting.ts) — the molecule renders a scene-tinted check for `tagged`, the same tint desaturated for `none_fit`, and a hollow ring for `pending`.
- **Classify** — the `TriagePicker` organism (keyed by `scene.part_id` so it resets per scene) emits `onConfirm(kind, confidence)` → `tagScene` and `onNoneFit()` → `markNoneFit`. Both dispatch through `sessionStore.apply`, then `advanceFocus` jumps to the next pending scene (wrapping), mirroring the design prototype's `_nextPending`.
- **Current tag state** (`tagShow`) is always visible for the focused scene: none-fit / `<sceneKindLabel(kind, lang)> · <confLabel>` (certeza/quase/na dúvida, from reference L1211) / not-yet-classified. The kind label and the confidence label both follow the UI language (@/ui/i18n); the stored `scene_kind` value and `Confidence` do not.
- **The gate** is `triageDone(state)` (all locked parts non-pending **and** ≥1 productive); it no longer renders its own disabled button — it only drives `reviewing` (see above) and, while NOT enabled, shows `gate.message` verbatim as a `role="status"` guidance line. That message is @/domain copy and therefore **stays PT-BR even with the UI in EN** (translating it would touch a frozen layer; see @/ui/i18n/docs.md). `advance` (now reached only through the review `review.continue` button) composes the pure `setMode(state, 'phrases')` with `enterPhrases` **only when the effective mode is phrases** (guarded by the enabled gate), a faithful port of the reference's setMode layer-entry (index.html L1006–1008).
- **Coverage drawer** — `CoverageDrawer` receives the computed `Coverage`; it owns its own Radix Dialog trigger tab (closed by default), so nothing from it renders on the listener surface until the facilitator opens it.

### Things to Know

- **none-fit finding vs all-none-fit lockout.** When `coverage.noneFit > 0` a finding line renders the contract phrase "evidência para nomear um tipo nativo quando o padrão se repetir". When `coverage.allNoneFit` an additional lockout explains that Segmentação/Conversation stay locked and the marks are saved as native-type evidence (meaning is contract; wording restyled per the issue) — digit-free, unlike the reference's `tNofit`/`triageDoneMsg` which carried counts.
- **Digit-free listener rule (§9.2):** the scene-focus area shows no scene number (the dots carry position), no counts. The `CoverageDrawer` is a facilitator surface (counts allowed) but is closed by default, so nothing digit-bearing is on screen at rest.
- **No browser test.** Unlike the escuta/segmentação stations, Triage renders no `Necklace`, so there is no layout-dependent geometry — the jsdom suite (`triage.test.tsx`) covers it fully; the picker's keyboard/roving behaviour is browser-tested in the organism (ENG-225).
- **Progress-dot check marks:** `ProgressDots` now renders a check inside classified (`tagged`) dots via its `scenes` prop (see Core Implementation) — this was previously omitted and documented as future scope; that gap closed with the Protótipo realignment.
- **The audio seam is the extension point.** `player` defaults to `null`; "▶ Ouvir esta cena" calls `player.toggle(part_id, span.s, span.e)` (no-op without a player). Extend audio through this prop.
- Finding/lockout entry motion (@/ui/pages/triage/triage.css) is guarded by `@media (prefers-reduced-motion: no-preference)`.

Created and maintained by Nori.
