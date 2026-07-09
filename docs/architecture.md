# Architecture — Colar de Sons (MVP)

**Status:** confirmed at planning (2026-07-08, stack "A" approved by the product owner).
**Audience:** every agent/human working an MVP issue. Read together with `CLAUDE.md`; issue bodies cite this file for conventions.

---

## 1. Confirmed stack & reasoning

| Slot                 | Choice (locked versions)                                                                                                                                                  | Why — tied to this project's constraints                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language             | **TypeScript 5.9 (pinned `~5.9.3`)**                                                                                                                                      | Fixed constraint (contracts discipline). Pinned below 7.x: TS 7 (Go-native) became `latest` in July 2026 and typed lint (typescript-eslint ≤8.63) does not support it yet. Revisit the pin when typescript-eslint raises its peer ceiling.                                                                                                                               |
| Framework            | **React 19.2**                                                                                                                                                            | 2–5k interactive DOM beads are comfortably inside DOM's envelope **when per-frame updates bypass React** (see §6, imperative island). React has the highest agent familiarity — the deadline is 2 days of mostly autonomous work; framework footguns cost more than raw framework speed. Solid 2.0 is in beta (API churn), Svelte 5 has far less training-data presence. |
| Build                | **Vite 8.1**                                                                                                                                                              | SPA, no SSR. **Post-cutoff traps an agent must know:** Vite 8 bundles with Rolldown/Oxc (`build.rolldownOptions`, not `rollupOptions`; `oxc`, not `esbuild`); `@vitejs/plugin-react` 6.x uses Oxc by default. Node floor **≥ 22.12**.                                                                                                                                    |
| State                | **Zustand 5**                                                                                                                                                             | One document-editor-style session state; tiny API surface; stable for 2 years. Known agent trap: selectors returning fresh references need `useShallow`.                                                                                                                                                                                                                 |
| Schemas              | **Zod 4.4**                                                                                                                                                               | `contracts/` DTO discipline. Import from the **root `"zod"` only** (lint-enforced ban on `zod/v3`/`zod/v4` subpaths). v4 idioms: `z.strictObject`, top-level `z.email()`, `.extend()` not `.merge()`, two-arg `z.record()`.                                                                                                                                              |
| Styling              | **CSS custom properties + CSS Modules**                                                                                                                                   | The Shemá system is specified as concrete tokens (redesign PRD §4). Vanilla CSS ports 1:1 from the prototypes and the token values are unit-testable. No utility-class translation layer.                                                                                                                                                                                |
| Tests                | **Vitest 4.1** — `projects`: `unit` (node), `dom` (jsdom), `browser` (real Chromium via `@vitest/browser-playwright`); **Playwright 1.61** for the golden generator + E2E | Per-layer coverage gates use `coverage.thresholds` glob keys (root config). jsdom has **no Web Audio / MediaRecorder / layout** — interaction-critical organisms (necklace, seam modal, conversation recorder) MUST test in the `browser` project (`*.browser.test.tsx`).                                                                                                |
| Boundaries           | **dependency-cruiser 18** (`.dependency-cruiser.cjs`)                                                                                                                     | Named rules with comments; CI error output reads `rule: from → to`. Independent of ESLint.                                                                                                                                                                                                                                                                               |
| Lint/format          | **ESLint 10 (flat) + typescript-eslint 8.63; Prettier 3.9.4 pinned exact**                                                                                                | `complexity: ["warn", {max: 15}]` — warn only (CLAUDE.md gate 5); never run eslint with `--max-warnings 0` or the warning becomes a block. Prettier pinned exact for byte-stable formatting.                                                                                                                                                                             |
| Package manager / CI | **pnpm 10 · Node ≥ 22.12 · GitHub Actions** (`checkout@v6`, `pnpm/action-setup@v6 cache:true`, `setup-node@v6`)                                                           | Required checks = job names: `golden-harness`, `typecheck`, `lint`, `depcruise`, `test`.                                                                                                                                                                                                                                                                                 |

**Alternative considered and rejected:** SolidJS 1.9 + Valibot — technically elegant for thousands of fine-grained bead updates, but Solid 2.0's in-flight breaking changes plus much lower agent familiarity made it strictly worse for a 2-day autonomous build. Decision recorded 2026-07-08.

Local dev note: Node **≥ 22.12** is required (jsdom 29 uses `require(esm)`; Vite 8 engine floor) — `.npmrc` sets `engine-strict=true` so a too-old Node fails at install with a clear message. With `fnm`: `fnm use 22`.

Deliberate strictness beyond the mandate: `noUncheckedIndexedAccess` is ON in tsconfig. The domain port is index-heavy (bead arrays, spans) and unchecked indexing is exactly where silent porting bugs live. Do not turn it off to ease a port — write the guard.

---

## 2. Module map

```
domain/      pure TS, ZERO imports (enforced) — 1:1 behavioral port of the reference
             grid/hash/ids · state · selection · frontier · scenes · triagem ·
             coverage · gates · scene-kinds (27, generated) · phrases · seam ·
             mapeamento-scripts (verbatim) · mapping (answer store)
contracts/   Zod-4 DTOs + mappers + THE serializer (imports domain only)
             manifesto · retorno · relatorio(.md builder) · session-state ·
             imports (entrega/retorno) · api + bucket (PROVISIONAL until tripod-api OpenAPI)
adapters/    ports + real impl + FIXTURE impl + register.ts (imports domain/contracts)
             audio · connectivity · api(auth) · sessions · bucket · granularity ·
             voice · tts
ui/          Shemá design system + stations (atomic design)
  tokens/    → atoms/ → molecules/ → organisms/ → templates/ + pages/ + app/ + state/
tests/
  golden/    the merge gate (see §5)
  e2e/       Playwright acceptance specs (E6 issues)
fixtures/    bucket audios + acousteme payloads · session states
docs/        specs (PRDs, plano, this file) + reference/index.html (UNTOUCHABLE)
```

**Layer rules (mechanically enforced by `.dependency-cruiser.cjs`):**

- `domain/` imports **nothing** — no other layer, no npm packages (tests may import vitest).
- `contracts/` imports only `domain/` (+ zod).
- `adapters/` import `domain/` + `contracts/`, never `ui/`.
- `ui/atoms` + `ui/molecules`: purely presentational — no domain, no contracts, no adapters.
- `ui/organisms`: may import **domain types** (props/hooks contract), never adapters.
- **Wiring layer** = `ui/pages` + `ui/templates` + `ui/app`: the only places that import adapters. _Recorded interpretation:_ CLAUDE.md names "pages/templates" as the adapter-wiring layer; `ui/app` (composition root: providers, routes, registries) belongs to that same wiring class. Atoms/molecules/organisms purity is unaffected.
- `ui/state`: bridges domain state to views; may import domain, never adapters (autosave reaches it as an injected port).

---

## 3. Ports (stub interfaces) — do not hardcode behind these

Defined by their owning adapter issues; signatures the app codes against:

```ts
// adapters/granularity — REAL RULE PENDING O8 (PRD §15.2). Stub uses fixture
// values; medium ≈ 0.25 s. Never invent the acousteme→duration derivation.
interface GranularityResolver {
  resolve(
    level: 'small' | 'medium' | 'large',
    acoustemes: AcoustemeEnvelope | null,
  ): { beadSec: number };
}

// adapters/api — JWT scheme of the shared API (python-jose Bearer). No own scheme.
interface AuthProvider {
  login(credentials: Credentials): Promise<CurrentUser>; // roles: facilitator | project-admin
  logout(): Promise<void>;
  currentUser(): CurrentUser | null;
  onAuthExpired(cb: () => void): Unsubscribe; // re-login must NOT clear app state
}

// adapters/bucket — the ONLY MVP audio source (PRD §7.4)
interface BucketSource {
  list(): Promise<AudioEntry[]>; // id, filename, duration, consentPresent, acoustemeEnvelope
  fetchBytes(id: string): Promise<ArrayBuffer>;
}

// adapters/sessions — full-state autosave + custody (PRD §7.3, §10.5)
interface SessionStore {
  create(audioRef: AudioRef, grid: GridParams): Promise<SessionId>;
  load(id: SessionId): Promise<SessionStateDto>;
  autosave(state: SessionStateDto): void; // debounced; pauses offline; flushes on reconnect
  complete(state: SessionStateDto, artifacts: ArtifactTriple): Promise<void>; // OPAQUE bytes — never re-serialized
  reopen(id: SessionId): Promise<void>;
  list(): Promise<SessionSummary[]>;
  lock: { acquire(id: SessionId): Promise<LockResult>; renew(): void; release(): Promise<void> };
  resources: {
    put(path: RespostaPath, blob: Blob): Promise<void>;
    get(path: RespostaPath): Promise<Blob | null>;
  };
}
```

Also port-shaped (same pattern): `AudioEngine` (decode + playback state machine), `ConnectivityMonitor`, `VoiceRecorder` (WebM/Opus per question key), `SpeechSynthesizer` (optional — its absence hides "Ouvir a pergunta").

---

## 4. Fixture-mode strategy & the no-conflict registries

Every adapter ships a **fixture implementation that is the default**; the real implementation activates via environment config (`ENG-247`, needs-human). The full app — and every UI/E2E test — runs with **no API at all**.

**Auto-registration (the loop's no-file-conflict guarantee).** Three `import.meta.glob` registries, created once by the shell (ENG-224) and **never edited again** — later issues only ADD files:

1. **Stations:** `import.meta.glob('/ui/pages/*/index.tsx')` — a route for a missing station renders a quiet "estação em construção" fallback. A station issue lands by adding its own `ui/pages/<station>/` dir.
2. **Adapters:** `import.meta.glob('/adapters/*/register.ts')` — each adapter self-registers its port name + fixture/real factories; pages resolve ports by name. A port that is absent (e.g. TTS before ENG-251) simply hides its affordance.
3. **App addons:** `import.meta.glob('/ui/app/addons/*.tsx')` — app-level chrome (e.g., the tutorial popup) mounts into a dedicated overlay layer by adding one file.

Same additive pattern inside components where an upgrade is planned: the storyteller guide reads `variants/*` and prefers `animated` when the file exists (ENG-232 adds one file, edits none).

Rationale: the planning contract forbids two `loop-ready` issues from declaring the same file in their Scope — these registries turn every integration point into an **add-a-file** operation.

---

## 5. Golden-harness design (the merge gate)

**Requirement (PRD §10):** given the same audio, grid and decisions, v2's artifacts must equal the v1 prototype's **byte for byte**. The prototype `docs/reference/index.html` is the executable reference and is never modified.

**Chosen driving approach — Playwright `page.evaluate` over the unmodified reference, generating committed goldens:**

1. **Decision scripts** (`tests/golden/cases/*.json`): a step vocabulary covering the whole flow (segment, cutScene, triage, phraseSelect, confirmPhrase with border decisions, reopen/remove/flag, answers, export).
2. **Generation** (`pnpm golden:generate`, ENG-212): headless Chromium loads the reference via `file://`; each step executes by setting the reference's globals (`state.selection`, …) and calling its real functions (`confirmPart`, `slideSeam`, `buildReturn`, …) inside `page.evaluate` — **no UI clicking, no audio decoding**. Audio is a plain `{numberOfChannels, sampleRate, getChannelData}` object filled with **synthetic PCM from a seeded integer LCG** (engine-independent by construction; `Math.sin`/`Math.random` are banned from the spec). Outputs are captured exactly as the reference serializes them (`JSON.stringify(x, null, 2)`, no trailing newline; `.md` joined with `\n`, one trailing newline) and committed under `tests/golden/expected/`.
3. **CI check `golden-harness` = two proofs:** `golden:verify` regenerates from the reference and byte-diffs against the committed goldens (goldens can never drift or be hand-edited), and the **runner** replays every case through `domain/` + `contracts/` and byte-diffs against the same goldens. Together: `domain ≡ reference`.
4. **Strictness phases:** placeholder (green + loud warning; a red required placeholder would deadlock all PRs) → ENG-212 (real infra, cases enable per module via `registry.ts`) → ENG-238 (strict: zero pending cases, 14-case edge pack). After that the gate is never weakened (CLAUDE.md gate 1).

**Why not the alternatives:** _extracted functions in Node_ — several reference functions touch the DOM unguarded (`$("partsList")…`), so extraction needs a shim, i.e. a modified reference and a fidelity risk; _jsdom_ — executes inline scripts but returns zeros for all layout APIs and has no Web Audio, silently diverging; _driving the reference's UI with clicks_ — slow, brittle, and unnecessary since the logic is callable directly. Node and Chromium are both V8, so `JSON.stringify` number formatting is identical across the boundary.

**Voice-answer report cells** (`respostas/...` paths) don't exist in the reference — those golden fixtures are **PRD-derived** (PRD §10.4/O5) and labeled as such in the fixture README (ENG-233).

---

## 6. UI performance pattern — the necklace

Render beads as **React-managed DOM** (structure changes are infrequent); drive the 60 fps playback lighting **imperatively**: one `requestAnimationFrame` loop toggling classes / CSS variables through refs on elements React has no reason to update, and **one delegated pointer handler** on the container (`data-index` lookup — no per-bead listeners). Never route per-frame updates through React state. This is the officially sanctioned escape hatch (react.dev "Manipulating the DOM with Refs") and the standard imperative-island pattern (cf. wavesurfer.js wrappers). Selection _decisions_ stay in `domain/selection.ts`; the organism only maps pointer→bead index and calls back.

---

## 7. Testing strategy per layer

| Layer                 | Runner                                                 | Gate                                                                                 |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| domain/               | Vitest `unit` (node)                                   | ≥ 90% line+branch; every PRD §11 rule has an explicit test; golden cases replay      |
| contracts/            | Vitest `unit` (node)                                   | ≥ 90%; valid + invalid fixture per schema; golden byte-identity                      |
| adapters/             | Vitest `unit` (node) against fixtures                  | fixture-driven behavior tests (no numeric gate)                                      |
| ui atoms/molecules    | Vitest `dom` (jsdom + Testing Library)                 | state-coverage tests, no snapshot-only                                               |
| ui critical organisms | Vitest `browser` (real Chromium, `*.browser.test.tsx`) | MANDATORY interaction tests: necklace click model, seam modal, conversation recorder |
| acceptance (E6)       | Playwright E2E (`tests/e2e/`, fixture mode)            | one spec per plano §3 criterion + §9.2 scan                                          |

Anti-gaming rules from CLAUDE.md apply verbatim (never lower thresholds, never skip failing tests, snapshot ≠ coverage).
