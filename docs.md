# Noridoc: Colar de Sons (repository root)

Path: @/

### Overview

- Colar de Sons is an ear-first web app: a facilitator and a listener from an oral culture segment a recorded oral story (a "necklace" of audio beads) into scenes and phrases, classify scenes against the Ruth ontology, answer meaning questions by voice, and export artifacts consumed by a downstream pipeline ("o Compilador").
- This is a complete from-scratch v2 implementation. The v1 prototype at @/docs/reference/index.html is the **executable behavioral reference** — read it to resolve behavior doubts, never modify it.
- The repo is being built up incrementally via Linear issues (project "Sound Necklace", milestone MVP) executed by an autonomous loop. Layer structure, CI quality gates, the golden harness (@/tests/golden), Shemá design tokens (@/ui/tokens), and the first `domain/` modules (grid/hash/ids — see @/domain/docs.md) exist; the remaining feature modules land issue by issue.

### How it fits into the larger codebase

- Single-page app, no server code here. Upstream: story audio + acousteme envelopes come from the project bucket via the shared API (`tripod-api`, recorded by the companion Oral Collector app). Downstream: three byte-frozen artifacts (`manifesto-contas.json`, `retorno-ancoragem.json`, report `.md`) are handed to o Compilador as **opaque bytes** — nothing may ever re-serialize them.
- Clean layer direction, dependencies always point inward, mechanically enforced by @/.dependency-cruiser.cjs:

```
ui/ ──▶ adapters/ ──▶ contracts/ ──▶ domain/
(wiring only        (Zod-4 DTOs +      (pure TS,
 in pages/           byte-exact         zero imports,
 templates/app)      serializer)        frozen core)
```

- Source-of-truth precedence: behavior/data/rules → @/docs/PRD-colar-de-sons-v2.md, remaining doubt → the reference's behavior; look/layout/motion → the Claude Design prototypes (see @/docs/PRD-redesign.md); MVP scope → @/docs/plano-de-acao-mvp.md.
- @/docs/architecture.md records the confirmed stack, all conventions (glob registries, port signatures, golden-harness design) and the rationale for every choice. Issue bodies cite it; read it with @/CLAUDE.md before touching anything.

### Core Implementation

| Slot              | Choice                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Language          | TypeScript pinned `~5.9.3` (typed lint does not yet support TS 7)                                    |
| Framework / state | React 19.2 · Zustand 5                                                                               |
| Build             | Vite 8 (Rolldown/Oxc — `rolldownOptions`, not `rollupOptions`)                                       |
| Schemas           | Zod 4, root `"zod"` import only (subpaths lint-banned)                                               |
| Tests             | Vitest 4 with three projects: `unit` (node), `dom` (jsdom), `browser` (real Chromium via Playwright) |
| Tooling           | pnpm 10 · Node ≥ 22.12 · ESLint 10 flat + Prettier pinned exact                                      |

- App entry: @/index.html → @/ui/app/main.tsx → @/ui/app/App.tsx (placeholder shell until the real shell issue lands).
- CI (@/.github/workflows/ci.yml) defines the required checks; **job names are the required-check names — never rename**: `golden-harness`, `typecheck`, `lint`, `depcruise`, `test`. The `test` job also runs the browser project after installing Chromium.
- Coverage is **per layer, not global** (glob-keyed thresholds in @/vitest.config.ts): `domain/` and `contracts/` ≥ 90% line+branch; `adapters/` reported without a number; `ui/` has no numeric gate — mandatory interaction tests for critical organisms instead.
- Complexity lint is warn-only (@/eslint.config.js): the domain port mirrors reference logic 1:1, and splitting a faithful port to satisfy a number is worse than the number. Never run eslint with `--max-warnings 0`.

### Things to Know

- **The golden harness (@/tests/golden) is the supreme merge gate.** Live since ENG-212: it byte-diffs artifacts replayed through `domain/`+`contracts/` against goldens generated from the reference; cases without a registered replayer pass as PENDENTE (with a warning) until ENG-238 flips strict mode. It can never be weakened. If your change breaks it, your change is wrong.
- **Frozen layers:** @/domain and @/contracts are `contract-critical` — PRs touching them stop for human review. @/ui and @/adapters (fixture-safe) may merge autonomously on green.
- Anti-gaming rules bind autonomous sessions: never lower a threshold, delete/skip a failing test, or add ignore-comments; a bug fix starts with the failing test that proves it.
- Loop contract: one issue = one branch (`feat/<issue-id>-<slug>`) = one small PR; the issue body is the complete brief; stay strictly in the issue's file scope. Integration points are **add-a-file** by design (three `import.meta.glob` registries, see @/docs/architecture.md) so parallel issues never edit the same file.
- @/docs is excluded from linting entirely (it contains the untouchable reference); `coverage/` in the working tree is gitignored local output.
- Doc-name drift to be aware of: @/CLAUDE.md cites `docs/PRD-redesign-v2.md` and `docs/PRD-colar-de-sons-as-built.md`; on disk the redesign PRD is @/docs/PRD-redesign.md and no as-built PRD is committed — the executable reference itself fills that role.
- Privacy is a product rule: no telemetry/analytics on listener behavior, no AI-generated content inside the app, no network calls from `domain/`. All UI copy is PT-BR.

Created and maintained by Nori.
