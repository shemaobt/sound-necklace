# Noridoc: triagem

Path: @/ui/pages/triagem

### Overview

- The scene-classification station (ENG-236): "Triagem" (PRD v2 §8.5, redesign §6.4), where the facilitator + listener classify each locked scene against the Ruth ontology — **one scene in focus at a time**, navigated by progress dots that double as jump targets.
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders the @/ui/organisms `TriagemPicker` and `CoverageDrawer`, and dispatches the pure triagem/gate reducers.
- Each scene shows "▶ Ouvir esta cena" (plays the scene span), the current tag state always visible (por classificar / kind + confidence / ⌀ nenhum se encaixa), and the picker. Marking "nenhum se encaixa" is a **finding**, not a dead end.

### How it fits into the larger codebase

- **The station between @/ui/pages/escuta2 and @/ui/pages/segmentacao.** Stations self-register through `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts), so the default export in `index.tsx` is mandatory — it is the registry value keyed by the directory name `triagem`. @/ui/app/App.tsx maps `triagem → triagem` and renders this station when the session mode is `triagem`.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import adapters, @/domain, @/ui/state and the ui component layers. The two organisms it consumes (`TriagemPicker`, `CoverageDrawer`) are **not** in @/ui/organisms/index.ts (that barrel was frozen by ENG-225), so they are imported by direct path — the same sibling-direct-import pattern segmentação uses.
- Reads session state via `useSessionStore` and writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause a classify/none-fit without losing in-memory state.
- The gate hands the guided flow to Segmentação; the all-none-fit case leaves Segmentação/Mapeamento locked (`modeLocks`), so this station is the productivity gate into phrase work.
- The itinerant `Player` (@/adapters/audio) is injected by prop, not constructed here — same audio seam as the escuta stations (`player` defaults to `null`).

### Core Implementation

- **`Triagem({ player })`** (@/ui/pages/triagem/index.tsx): subscribes `session`; renders `null` until a session exists. A single `useMemo` keyed on `session` derives `{ parts: lockedParts, coverage: computeCoverage, gate: triagemDone }` (stable ref between playback frames). Local React state holds only `focusIdx` (the scene in focus).
- **Progress dots** (@/ui/molecules `ProgressDots`): one per locked part, `current = focusIdx`, `onSelect = setFocusIdx`. Digit-free (`aria-label="ir para a cena"`, `aria-current="step"` on the focused dot). Each dot's `scenes[i]` derives `state` from `part.tag_state` (`tagged`/`none_fit`/`pending`) and `tint` from `sceneColor(i)` (@/ui/pages/escuta2/cutting.ts) — the molecule renders a scene-tinted check for `tagged`, the same tint desaturated for `none_fit`, and a hollow ring for `pending`.
- **Classify** — the `TriagemPicker` organism (keyed by `scene.part_id` so it resets per scene) emits `onConfirm(kind, confidence)` → `tagScene` and `onNoneFit()` → `markNoneFit`. Both dispatch through `sessionStore.apply`, then `advanceFocus` jumps to the next pending scene (wrapping), mirroring the design prototype's `_nextPending`.
- **Current tag state** (`tagShow`) is always visible for the focused scene: none-fit / `<sceneKindLabel(kind, lang)> · <confLabel>` (certeza/quase/na dúvida, from reference L1211) / not-yet-classified. The kind label and the confidence label both follow the UI language (@/ui/i18n); the stored `scene_kind` value and `Confidence` do not.
- **The gate** (the telha `variant="primary"` advance button, `data-role="primary-action"`) is disabled unless `triagemDone(state).enabled` (all locked parts non-pending **and** ≥1 productive); its helper message comes verbatim from `triagemDone(state).message` — which is @/domain copy and therefore **stays PT-BR even with the UI in EN** (translating it would touch a frozen layer; see @/ui/i18n/docs.md). On advance it composes the pure `setMode(state, 'segmentacao')` with `enterSegmentacao` **only when the effective mode is segmentacao** (guarded by the enabled gate), a faithful port of the reference's setMode layer-entry (index.html L1006–1008).
- **Coverage drawer** — `CoverageDrawer` receives the computed `Coverage`; it owns its own Radix Dialog trigger tab (closed by default), so nothing from it renders on the listener surface until the facilitator opens it.

### Things to Know

- **none-fit finding vs all-none-fit lockout.** When `coverage.noneFit > 0` a finding line renders the contract phrase "evidência para nomear um tipo nativo quando o padrão se repetir". When `coverage.allNoneFit` an additional lockout explains that Segmentação/Mapeamento stay locked and the marks are saved as native-type evidence (meaning is contract; wording restyled per the issue) — digit-free, unlike the reference's `tNofit`/`triagemDoneMsg` which carried counts.
- **Digit-free listener rule (§9.2):** the scene-focus area shows no scene number (the dots carry position), no counts. The `CoverageDrawer` is a facilitator surface (counts allowed) but is closed by default, so nothing digit-bearing is on screen at rest.
- **No browser test.** Unlike the escuta/segmentação stations, Triagem renders no `Necklace`, so there is no layout-dependent geometry — the jsdom suite (`triagem.test.tsx`) covers it fully; the picker's keyboard/roving behaviour is browser-tested in the organism (ENG-225).
- **Progress-dot check marks:** `ProgressDots` now renders a check inside classified (`tagged`) dots via its `scenes` prop (see Core Implementation) — this was previously omitted and documented as future scope; that gap closed with the Protótipo realignment.
- **The audio seam is the extension point.** `player` defaults to `null`; "▶ Ouvir esta cena" calls `player.toggle(part_id, span.s, span.e)` (no-op without a player). Extend audio through this prop.
- Finding/lockout entry motion (@/ui/pages/triagem/triagem.css) is guarded by `@media (prefers-reduced-motion: no-preference)`.

Created and maintained by Nori.
