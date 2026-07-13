# Noridoc: ui/i18n

Path: @/ui/i18n

### Overview

- The language layer of the app (ENG-279): PT-BR (default) + EN for the **UI chrome only**. It owns the i18next init, the two dictionaries, the two translators for copy that originates in @/domain (scene-kind labels, the scripted interview questions), and the Vitest setup file that initializes i18n for every UI test.
- It exists because facilitators may be English-speaking, while everything the downstream pipeline ("o Compilador") consumes stays frozen PT-BR. The split is the whole point: **what a person reads on screen is translatable; what is written to an artifact is not.**
- The chosen language persists in `localStorage` (a namespaced, versioned key) and is re-read at init, so it survives a reload. The header toggle (@/ui/app/header.tsx) is the only writer.

### How it fits into the larger codebase

- Sits at the same depth as @/ui/organisms in the atomic ladder (see @/ui/docs.md): it may import @/domain (types + pure display helpers) and npm, never adapters — so the @/.dependency-cruiser.cjs rule "only pages/templates/app import adapters" holds without an exception. It imports nothing from @/contracts.
- Consumed by @/ui/organisms, @/ui/pages and @/ui/app/header.tsx. **@/ui/atoms and @/ui/molecules never import it**: they stay purely presentational and receive copy through props. Their PT-BR prop defaults (e.g. the DocumentCard download label, the ConfidenceTrio disc labels) are the one place untranslated chrome copy still lives — a caller must pass a translated label to override them.
- The artifact path never touches this folder:

```
domain (PT-BR scripts, scene_kind values)
   ├─▶ contracts/ builders ─▶ retorno-ancoragem.json · manifesto-contas.json · relatorio-mapeamento.md
   │        (byte-frozen, PT-BR — the golden harness diffs these)
   └─▶ ui/i18n  ─▶ ui/organisms + ui/pages   (DISPLAY only: PT or EN)
```

@/contracts/relatorio.ts serializes the question text verbatim from @/domain/mapeamento-scripts.ts, and the scene-kind `value` (`GLEANING_SCENE`) is the contract with the Compilador. The guarantee that an EN UI cannot move a byte rests on **two** things, and it is worth being precise about which does what. Structurally, the `contracts-so-domain` rule in @/.dependency-cruiser.cjs makes it a CI failure for @/contracts to import anything from `ui/`, so a builder cannot reach a dictionary — but that alone is not enough, because the builders serialize whatever is in `SessionState`. The load-bearing invariant is **"no translated string is ever written into `SessionState`"**, and NO rule enforces that: it is held by convention plus the EN byte-identity spec in @/tests/e2e, which drives the real UI, switches it to EN, and diffs the three exported artifacts against @/tests/golden. That spec is the thing standing between a future `setAnswer(s, slot, t('…'))` and a corrupted artifact — the golden harness would not catch it (it replays through domain+contracts with no UI at all), and the PT e2e would not either. The nearest miss today is @/ui/pages/setup/index.tsx, where the story name falls back to a raw `'colar'` literal that feeds `storySlug` → the artifact filename; a `t()` there would move bytes.

- **Neither @/domain nor @/contracts was modified** to add i18n, and neither should be: they are frozen layers. This is why user-facing copy that is DEFINED there still renders PT-BR under an EN UI — the domain gate/error copy (`triagemDone`'s message, `SCENE_ERROR_COPY`, `FRASE_ERROR_COPY`, `BORDER_COPY`) and the import precondition messages in @/contracts/imports.ts. Translating those means changing a frozen layer, which is contract-critical and deliberately out of scope for a `ui/`-only change.
- **The six station labels have exactly one source** (`stations.*`). The fio-de-contas stepper (@/ui/app/stepper-model.ts holds `labelKey`, @/ui/app/stepper.tsx translates) and the Dashboard's progress glance both read it. They used to hold separate copies, which is how an EN dashboard could sit next to a PT stepper — if you add a seventh station, add the key once.
- **Copy that lives in a molecule as a prop default is a leak waiting to happen.** Molecules are presentational: the organism/page passes translated copy in (`downloadLabel`/`downloadedLabel`, `roleTitle`, `dotLabel`, `stateLabels`). The PT-BR defaults exist only so a molecule renders standalone in its own test — a caller that forgets to pass the prop ships PT-BR into the EN UI, and nothing fails. The `atomos-e-moleculas-sem-i18n` rule in @/.dependency-cruiser.cjs stops the tempting fix (importing `t()` into the molecule), because @/ui/i18n imports @/domain and a molecule must not reach it, not even transitively.

### Core Implementation

- **Init is synchronous, inline and provider-less** (@/ui/i18n/index.ts). Resources are bundled objects (no HTTP backend, no lazy namespace load) and `initReactI18next` registers the singleton globally, so no `<I18nextProvider>` is mounted anywhere — `useTranslation()` just works in any component. @/ui/app/main.tsx imports the module for its side effect **before the first render**.
- **No `i18next-browser-languagedetector`.** It was rejected: its cache/detect ordering overwrites the saved choice on reload. Persistence is done by hand instead — `initialLang()` reads the storage key (unknown or missing value falls back to PT), and `setLang()` changes the language, writes the key, and sets `<html lang>`. Every storage access is wrapped in try/catch and degrades to a session-only choice, the precedent set by the tutorial popup (@/ui/organisms/tutorial-popup/README.md).
- **PT/EN key parity is enforced by the typechecker, not by tooling.** `pt.ts` exports the dictionary WITHOUT `as const` (values stay `string`) plus `export type Dict = typeof pt`; `en.ts` declares its dictionary as `const en: Dict`. A missing key fails the build, an extra key trips the excess-property check. Adding a string = adding it to both files.
- **`sceneKindLabel(value, lang)`** (@/ui/i18n/scene-kind-label.ts) is the display label of a `scene_kind`: PT uses `skShort` (PT-BR label, English fallback), EN uses `skEnShort` — the SAME short English the report already emits. It replaced direct `skShort` calls in the Triagem picker, the coverage drawer, and the Triagem/Segmentação stations. The stored value never changes.
- **`questionTextFor(slot, lang)` / `questionNoteFor(slot, lang)`** (@/ui/i18n/mapeamento-questions.ts) translate the scripted interview. The EN map is addressed by **level + `k`**, because `k` repeats across levels (`quem`, `onde` and `ausencia` exist at more than one level and mean different things). With no EN entry the domain PT-BR is returned, so a question can never disappear from the screen. Product decision: the DISPLAYED (and spoken) question follows the UI language, while the exported `.md` keeps the domain PT-BR verbatim.
- **Both translators are pure functions taking `lang` explicitly**, not hooks — callers thread `i18n.language` from `useTranslation()`. That keeps them unit-testable with no i18n init and keeps the hook count in the organisms down.
- **`test-setup.ts` is a Vitest `setupFiles` entry** for the `dom` and `browser` projects (@/vitest.config.ts). Importing it initializes i18n in PT for every UI test and its `afterEach` resets the language, so a test that switches to EN cannot leak into the next one.

### Things to Know

- **A surface rendered without the init shows raw keys** (`login.title` instead of "Entrar"). That is the failure mode to recognize: production is covered by the side-effect import in @/ui/app/main.tsx, tests by the setup file. A new Vitest project that renders UI must add the setup file too.
- **Existing PT-BR copy is a contract with the test suite.** The unit suites and the Playwright specs (@/tests/e2e — see its `ColarApp` page object) select by verbatim PT-BR strings, which now live in `pt.ts`. Editing a PT value there breaks those selectors at a single point, by design.
- **Translated labels can no longer be identifiers.** Two call sites had to gain stable ids when their copy became translatable: the Triagem picker's theme blocks carry a slug `data-theme` (`indo-e-vindo`) instead of the visible name, and the seam modal's action list carries a `key` because the label no longer identifies the focus-target button. Any new code that keys off visible copy has the same bug in waiting.
- **The Triagem filter matches three things** — the PT-BR label, the currently displayed label, and the English contract value — so filtering never gets worse by switching language.
- Interpolation runs with `escapeValue: false` because React already escapes; passing raw HTML through `t()` would be an XSS foot-gun that nothing here does.
- The EN interview translations ship **pending human review** (flagged in @/ui/i18n/mapeamento-questions.ts). They are display-only, so a wording change there cannot affect an artifact.

Created and maintained by Nori.
