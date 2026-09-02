# Noridoc: Colar de Sons (repository root)

Path: @/

### Overview

- Colar de Sons is an ear-first web app: a facilitator and a listener from an oral culture segment a recorded oral story (a "necklace" of audio beads) into scenes and phrases, and classify scenes against the Ruth ontology. **The app runs Ouvir → Cortar → Triagem → Frases → Rever and stops there** (owner decision, 2026-09-01, ENG-689 scope cut 1/4, then ENG-691 scope cut 2/4, then ENG-725 which inserted Rever — a fifth station where the pair review the whole story together — before the flow's actual end): no interview, no report, no export, and the SPA generates no artifact at all — the cuts/scenes/phrases persist through the autosave for a different system to consume later. ENG-691 went further than the UI: it removed the interview scripts/answer store from `domain/`, the three artifact builders and the serializer from `contracts/`, and the golden harness (@/tests/golden) that byte-diffed them against the reference — that machinery does not exist any more, not merely lack a UI in front of it. See @/CLAUDE.md's UI rules and "The golden harness is gone" section for the record.
- This is a complete from-scratch v2 implementation. The v1 prototype at @/docs/reference/index.html is the **executable behavioral reference** — read it to resolve behavior doubts, never modify it. One exception is on record (ENG-604, owner decision, 2026-08-26 — the first level-1 question's wording); see @/CLAUDE.md. Any further edit needs a new owner decision.
- The repo is being built up incrementally via Linear issues (project "Sound Necklace", milestone MVP) executed by an autonomous loop. Layer structure, CI quality gates, Shemá design tokens (@/ui/tokens) and atoms (@/ui/atoms), the audio engine adapter (@/adapters/audio), and the `domain/` core through triagem, gates, and the phrase/seam layer (see @/domain/docs.md) exist; the remaining feature modules land issue by issue. The golden harness that used to sit in this list was removed in ENG-691 (see Things to Know).

### How it fits into the larger codebase

- Single-page app, no server code here. Upstream: story audio + acousteme envelopes come from the project bucket via the shared API (`tripod-api`, recorded by the companion Oral Collector app). **There is no downstream any more (ENG-691):** the app used to hand three byte-frozen artifacts to o Compilador; the SPA now produces nothing beyond the session autosave (@/contracts/session-state.ts), and o Compilador comes back later in another product.
- Clean layer direction, dependencies always point inward, mechanically enforced by @/.dependency-cruiser.cjs:

```
ui/ ──▶ adapters/ ──▶ contracts/ ──▶ domain/
(wiring only        (Zod-4 DTOs +      (pure TS,
 in pages/           byte-exact         zero imports,
 templates/app)      serializer)        frozen core)
```

- Source-of-truth precedence: behavior/data/rules → @/docs/PRD-colar-de-sons-v2.md, remaining doubt → the reference's behavior; look/layout/motion → the Claude Design prototypes (see @/docs/PRD-redesign.md); MVP scope → @/docs/plano-de-acao-mvp.md.
- @/docs/architecture.md records the confirmed stack, all conventions (glob registries, port signatures) and the rationale for every choice. Issue bodies cite it; read it with @/CLAUDE.md before touching anything. Its golden-harness design section is now history — the harness was removed in ENG-691 and that file, being owner-authored under `docs/`, was left as written.

### Core Implementation

| Slot              | Choice                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Language          | TypeScript pinned `~5.9.3` (typed lint does not yet support TS 7)                                    |
| Framework / state | React 19.2 · Zustand 5                                                                               |
| Build             | Vite 8 (Rolldown/Oxc — `rolldownOptions`, not `rollupOptions`)                                       |
| Schemas           | Zod 4, root `"zod"` import only (subpaths lint-banned)                                               |
| Tests             | Vitest 4 with three projects: `unit` (node), `dom` (jsdom), `browser` (real Chromium via Playwright) |
| Tooling           | pnpm 10 · Node ≥ 22.12 · ESLint 10 flat + Prettier pinned exact                                      |

- App entry: @/index.html → @/ui/app/main.tsx (design-token + i18n init side effects) → @/ui/app/App.tsx, the real composition-root shell (router, whole-story progress band, itinerant player, station host — see @/ui/app/docs.md).
- CI (@/.github/workflows/ci.yml) defines the required checks; **job names are the required-check names — never rename**: `typecheck`, `lint`, `depcruise`, `test`. The `golden-harness` job (`golden:verify` regenerating from the reference) left CI in ENG-691 along with the harness itself — see Things to Know. Two jobs still need Chromium and **share one shape — keep the two blocks identical** (ENG-515): `test` (`test:browser`) and `e2e`. Each resolves the **installed** Playwright version, caches `~/.cache/ms-playwright` under a key derived from it (never hard-coded — a pinned key ages silently and serves the wrong browser), downloads the browser **only on a cache miss**, and caps that step with `timeout-minutes` well below the job cap. There is deliberately **no `--with-deps`**: it installed nine font packages (CJK, Cyrillic, Thai) and zero shared libraries — the runner image already carries everything Chromium needs to launch — while its `apt-get update` was the step that hung until the job was cancelled, and a cancelled job reads as `fail`. The packages traded away are listed in PR #193. Never make a missing browser pass: no `continue-on-error`.
- Deployment (@/.github/workflows/deploy.yml, @/docs/deploy-gcloud.md) is a separate workflow that fires on push to `main`: it builds @/Dockerfile, pushes to Artifact Registry and runs `gcloud run deploy` — the same shape `tripod-console` and `meaning-map-ui` use. There is still no server code here; @/nginx.conf only serves the static build and reverse-proxies `/api` to a backend resolved at container start, which is why `VITE_API_BASE_URL` is left unset in production and @/ui/app/api-config.ts falls back to the relative `/api`. **Not deployed yet** — the one-time GCP setup is listed in the doc.
- Coverage is **per layer, not global** (glob-keyed thresholds in @/vitest.config.ts): `domain/` and `contracts/` ≥ 90% line+branch; `adapters/` reported without a number; `ui/` has no numeric gate — mandatory interaction tests for critical organisms instead.
- Complexity lint is warn-only (@/eslint.config.js): the domain port mirrors reference logic 1:1, and splitting a faithful port to satisfy a number is worse than the number. Never run eslint with `--max-warnings 0`.

### Things to Know

- **The golden harness is gone (ENG-691).** Live since ENG-212, it byte-diffed artifacts replayed through `domain/`+`contracts/` against goldens generated from the reference, and stood as the one gate that could never be relaxed. It was not relaxed — it was removed outright, together with the three artifacts it diffed, when the owner decided the app would stop producing them; keeping the two JSON builders alive purely to keep the gate alive was considered and rejected. `domain/`'s own unit tests are now the _only_ proof it still matches @/docs/reference/index.html — thorough, but the port checking itself, with no second source. See @/CLAUDE.md's "The golden harness is gone" section; do not treat the absence as an oversight and do not rebuild it.
- **Frozen layers:** @/domain and @/contracts are `contract-critical` — PRs touching them stop for human review (that review is now the _only_ thing standing there, per the bullet above). @/ui and @/adapters (fixture-safe) may merge autonomously on green.
- Anti-gaming rules bind autonomous sessions: never lower a threshold, delete/skip a failing test, or add ignore-comments; a bug fix starts with the failing test that proves it.
- Loop contract: one issue = one branch (`feat/<issue-id>-<slug>`) = one small PR; the issue body is the complete brief; stay strictly in the issue's file scope. Integration points are **add-a-file** by design (three `import.meta.glob` registries, see @/docs/architecture.md) so parallel issues never edit the same file.
- @/docs is excluded from linting entirely (it contains the untouchable reference); `coverage/` in the working tree is gitignored local output.
- Doc-name drift to be aware of: @/CLAUDE.md cites `docs/PRD-redesign-v2.md` and `docs/PRD-colar-de-sons-as-built.md`; on disk the redesign PRD is @/docs/PRD-redesign.md and no as-built PRD is committed — the executable reference itself fills that role.
- Privacy is a product rule: no telemetry/analytics on listener behavior, no AI-generated content inside the app, no network calls from `domain/`.
- **Language: PT-BR is the default UI language and the UI chrome is PT/EN** (ENG-279, see @/ui/i18n/docs.md). **There are no artifacts to be English any more (ENG-689/ENG-691):** the "artifacts are English" rule (ENG-326/ENG-356) governed `manifesto-contas.json`/`retorno-ancoragem.json`/the report `.md`, all three deleted with their builders; the SPA now writes exactly one document, the session autosave (@/contracts/session-state.ts), and that one is internal, not a deliverable. English stays the language of the code, of `scene_kind` values and of everything committed (issues, PRs, commits, `docs.md`); PT-BR stays the language of the UI copy and of the story data. User-facing copy defined inside the frozen layers (gate/error messages, import preconditions) still renders PT-BR under an EN UI — translating it is a frozen-layer change.

Created and maintained by Nori.
