# Noridoc: tests/golden

Path: @/tests/golden

### Overview

- **The merge gate.** Replays scripted decision sets both through the untouchable v1 reference (@/docs/reference/index.html) and through @/domain + @/contracts, then byte-diffs the produced artifacts (`retorno-ancoragem.json`, `manifesto-contas.json`, report `.md`). Equality proves `domain ≡ reference`.
- Current state: @/tests/golden/placeholder.mjs — exits **green with a loud warning**. A red required placeholder would deadlock every PR including the harness's own; the check exists from day one and gains teeth in phases.
- Runs as the CI job `golden-harness` (@/.github/workflows/ci.yml) via `pnpm golden` on every PR. It is the one gate that can never be relaxed.

### How it fits into the larger codebase

- Guards the frozen layers: any change to @/domain or @/contracts must keep the harness green, which is why those layers are contract-critical.
- Consumes the reference read-only over `file://`; commits its generated goldens under `expected/` so they can never drift or be hand-edited.
- The synthetic-PCM approach links to @/fixtures: one bucket fixture entry mirrors a golden case's PCM, so fixture-mode app runs and the harness agree on audio.

### Core Implementation

- Target design (recorded in @/docs/architecture.md §5; infrastructure lands with ENG-212, layout sketched in @/tests/golden/README.md):
  - **Decision scripts** (`cases/*.json`) — a step vocabulary covering the whole flow (segment, cutScene, triage, confirmPhrase with border decisions, reopen/answers/export, …).
  - **Generation** (`pnpm golden:generate`) — headless Chromium loads the reference; each step executes inside Playwright `page.evaluate` by setting the reference's globals and calling its **real functions** directly. No UI clicking, no audio decoding.
  - **Audio** — a plain object shaped like an AudioBuffer filled with synthetic PCM from a **seeded integer LCG**; `Math.sin`/`Math.random` are banned by the spec so output is engine-independent by construction.
  - **Byte capture** — outputs are taken exactly as the reference serializes them (`JSON.stringify(x, null, 2)`, no trailing newline; `.md` joined with `\n`, one trailing newline) and committed under `expected/`.
- The CI check is **two proofs**: `golden:verify` regenerates from the reference and byte-diffs against the committed goldens (no drift), and the runner replays every case through `domain/`+`contracts/` and byte-diffs against the same goldens.
- Strictness phases: placeholder (now) → **ENG-212** real infrastructure, cases enabling per module via `registry.ts` as domain issues land → **ENG-238** strict mode (zero pending cases + edge-case pack). After ENG-238 the gate is never weakened, ever.

### Things to Know

- **If your change breaks the harness, your change is wrong — not the harness.** Never weaken it to pass; stop and escalate instead.
- Voice-answer report cells (`respostas/...` paths) do not exist in the v1 reference — those golden fixtures are **PRD-derived** (PRD §10.4 / decision O5) and must be labeled as such in the fixture README.
- The design works because Node and Chromium are both V8: `JSON.stringify` number formatting is identical across the generate/verify boundary.
- Alternatives were evaluated and rejected (recorded in @/docs/architecture.md §5): extracting reference functions into Node requires a DOM shim (i.e., a modified reference — fidelity risk); jsdom silently diverges (zeroed layout, no Web Audio); driving the reference UI with clicks is slow and unnecessary since the logic is callable directly.
- `pnpm golden` currently points at the placeholder in @/package.json; ENG-212 repoints it. The placeholder's green-by-design behavior is documented in the file header — do not "fix" it to red.

Created and maintained by Nori.
