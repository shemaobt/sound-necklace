# CLAUDE.md — Colar de Sons (MVP)

Colar de Sons is an ear-first web app where a facilitator + a listener from an oral culture segment a recorded oral story (necklace of audio beads) into scenes and phrases, and classify those scenes against the Ruth ontology. **The app ends there** (owner decision, 2026-09-01, ENG-689/ENG-691): the segmentation is kept by the autosave, and the SPA produces no artifact and hands nothing to a downstream pipeline. The interview by voice, the report, the three exported artifacts and "o Compilador" were the product's other half until that decision; they come back later, in another flow, in another product. This repo is a **complete from-scratch implementation** — no code is reused from the v1 prototype.

## Source of truth (read before coding)

All specs live in `docs/`:

- `docs/PRD-colar-de-sons-v2.md` — **the product spec.** Behavior, rules, gates, thresholds, data contracts. Section references in issues (e.g. "§8.5") point here.
- `docs/PRD-colar-de-sons-as-built.md` — code-level description of the v1 prototype. **Not committed to this repo**: treat any citation of it as a pointer to the executable reference below, which is the authoritative behavior source.
- `docs/PRD-redesign.md` — the visual/interaction design spec (Shemá system, v2).
- `docs/plano-de-acao-mvp.md` — MVP scope cut, acceptance criteria, sacrifice order.
- `docs/reference/index.html` — **the executable reference.** The v1 prototype. Read its code to resolve any behavior/contract doubt. NEVER modify this file. Since ENG-691 it is no longer a *proof* — the golden harness that diffed against it is gone — but it remains the behavioural record of the segmentation, and precedence rule 1 below still points at it. **One registered exception, ENG-604 (owner decision, 2026-08-26):** the `q` of the first level-1 question (`recontar`, inside the `L1_Q` literal) was replaced with the approved wording, so the port could stay byte-identical to it without a divergence table. Both the port and that table are gone with the interview; the edit is marked by a comment on the line itself and is kept as the record. Any further edit requires a new owner decision — the rule still stands, it now has one recorded case.

**Precedence rules (memorize):**
1. Behavior, data, rules → **PRD v2 wins**; in any remaining doubt, `docs/reference/index.html` behavior wins.
2. Look, layout, motion → **the Claude Design prototypes win** (listed in redesign PRD §11; imported to `docs/design/` — see its README).
3. MVP scope doubts → `plano-de-acao-mvp.md` §2 (in) / §2.5 (out) / §4 (later).

## Architecture (clean, ports & adapters)

We follow a **clean architecture in the general sense** — dependencies always point inward (ui → adapters → contracts → domain; `domain/` imports nothing from the outer layers, `contracts/` imports only `domain/` types) — without committing to any canonical layer naming (this is NOT Uncle Bob's Clean Architecture™; no "use case interactor" ceremony where a plain function does the job). The test of cleanliness here is practical: `domain/` compiles and tests with zero framework/IO imports, and every outer dependency is swappable behind an interface.

- `contracts/` — schema-validated DTOs + mappers (schema library per `docs/architecture.md`) for: session state (the autosave document), pipeline delivery/return imports, bucket audio + acousteme payload, API endpoints. The three artifact builders (`manifesto-contas.json`, `retorno-ancoragem.json`, report `.md`) and the artifact serializer left with the export (ENG-691). **FROZEN LAYER:** changes require explicit human approval in the PR. Until ENG-691 they also required the golden harness green; that proof no longer exists, so human review is now the *only* thing standing there — weigh a change to this layer accordingly.
- `domain/` — pure TypeScript, zero framework/IO imports: bead grid math, FNV-1a `manifest_id` hash, frontier/seam logic, border-crossing thresholds, mode gates, triagem state, phrases. A 1:1 behavioral port of the reference, minus the interview question scripts and answer store, which left in ENG-691. **FROZEN LAYER** (same rule as contracts/, and with the same caveat: the harness that proved it is gone).
- `adapters/` — API client (auth, sessions, bucket, artifacts, audit), Web Audio (decode/playback). Every adapter implements an interface and ships a **fixture mode** so the full app runs with no real API. The voice, transcription and speech adapters left with the interview (ENG-689, scope cut 1/4).
- `ui/` — Shemá design system + the flow stations, organized by **atomic design**:
  - `ui/tokens/` — Shemá design tokens (colors, type, radii, motion) from the Claude Design prototypes.
  - `ui/atoms/` — pearl/bead, cord line, chip, button, confidence disc (filled/half/dashed), waveform bar, play glyph.
  - `ui/molecules/` — bead row, selection band + edge beads, scene/phrase chip, confidence trio, whole-story progress bar.
  - `ui/organisms/` — the necklace (rendering + interaction), the Triagem picker, the coverage drawer, the seam modal, the block-done screen, the dashboard session list.
  - `ui/templates/` + `ui/pages/` — station layouts and the wired screens (Setup, Escuta 1/2, Triagem, Segmentação, Dashboard, Login).
  - `ui/i18n/` — the language layer (PT default + EN): i18next init, the two dictionaries, and the display translator for scene-kind labels. Chrome only — see the UI rules below.
  - Dependency rule inside ui/: atoms and molecules are **purely presentational** (props in, events out — no domain, adapter or i18n imports — copy arrives as props); organisms may consume domain state via props/hooks and may pull copy from `ui/i18n`; only pages/templates/`ui/app` (the wiring layer / composition root) wire adapters. `ui/` may be merged autonomously when tests pass.

Stubs behind interfaces (do not hardcode): `GranularityResolver` (acousteme → bead duration; the real O8 rule landed in ENG-242 — `granularity_frames[level] × hop_sec`, fallback grid hop 20 ms / 10-25-50 frames), auth mechanism (follows the shared API standard), bucket access. The LEVEL fed to that resolver is a **project** setting since ENG-352, read from the API — never a per-session pick.

## The golden harness is gone (ENG-691)

`tests/golden/` replayed scripted decision sets through `domain/`+`contracts/` and byte-diffed the produced `retorno-ancoragem.json` + `manifesto-contas.json` + report `.md` against outputs generated by the reference `index.html`. It was the supreme merge gate: **every** change to `domain/` was proved against the reference, byte for byte, on every PR.

**It was removed in ENG-691, with the scope cut that removed the artifacts it diffed** — there is nothing left for it to compare. The owner decided this with the consequence in front of him (2026-09-01), after the alternative of keeping the two JSON builders alive purely to keep the gate alive was proposed and rejected. Do not rebuild it, and do not treat its absence as an oversight.

What this costs, stated plainly so nobody has to rediscover it: **a change to `domain/` is now proved only by `domain/`'s own unit tests.** They are thorough (see the coverage gate) and they encode the reference's quirks, but they are the port checking itself — no second, independent source says the port still matches `docs/reference/index.html`. When you touch the segmentation rules, read the reference and cite the line numbers, as the module docstrings already do; that citation is now the whole of the audit trail.

## Non-negotiable domain facts (details: PRD §10–§11)

- Bead indices are the universal coordinate; grid = `floor(dur/beadSec + 1e-9)` beads + partial bead.
- `manifest_id` = `fnv1a32:xxxxxxxx` over channels/rate/count/strided-int16-PCM/bead-ms.
- IDs: `PT#` scenes (stable, lowest free), `P#` phrases (lowest free).
- `scene_kind` values are **English** (27 kinds, generated list — never hand-edit); PT-BR labels display-only.
- **There are no artifacts** (ENG-689/ENG-691). The rule that governed them — every human-readable value and field name in `manifesto-contas.json`, `retorno-ancoragem.json` and the report `.md` in English (ENG-326/ENG-356) — has nothing left to govern: the SPA writes exactly one document, the session autosave in `contracts/session-state.ts`, and that one is internal, not a deliverable. English stays the language of the code, of `scene_kind` values and of everything committed (issues, PRs, commits, `docs.md`); PT-BR stays the language of the UI copy and of the story data.
- Confidence stored as `high`/`medium`/`low`; tag states `pending`/`tagged`/`none_fit`. The legacy PT-BR confidence values are rejected by the schema, never coerced.
- The session document is `schema_version: 4` and has **no migration path**: v1–v3 carried interview data this product can no longer hold, so they fail loudly on read rather than half-loading (owner decision, ENG-691).
- Frontier: sequential locking; reopening item *i* unlocks *i* and everything after; first phrase may back-reach to previous scene's start; seam-move threshold `max(3, 25% of scene)`; two-productive-scenes escalation.
- Gates: whole story → scenes → (all triaged + ≥1 productive) → segmentação → **end**. All-none-fit locks downstream. Confirming the last productive scene's phrasing puts the session in `mode: 'concluida'`, which is the end of the flow and NOT a station (ENG-691) — `modeLocks` has no key past `segmentacao`.

## UI rules

- **The app runs Ouvir → Cortar → Triagem → Frases, and ends there** (owner decision, 2026-09-01; ENG-689 scope cut 1/4, ENG-691 scope cut 2/4). Confirming the last productive scene closes the session: there is no conversation, no report, no export, and **the SPA generates no artifact**. The cuts, scenes and phrases are kept by the autosave, for a different system to consume. `confirmFrasesDone` returns `kind: 'finished'` and `domain/` moves to `mode: 'concluida'`; there is no station after Frases to name. The interview comes back later, in another flow, in another product. **Slices 3–4 of the cut still have to land.**
- **PT-BR is the default UI language and the UI chrome is PT/EN** (`ui/i18n/`, react-i18next). The companion half of this rule — *artifacts are always English* (ENG-326/ENG-356) — no longer applies to anything: there are no artifacts (ENG-691). Quoted strings in the PRDs remain contract-level copy — reuse them verbatim, but as values in `ui/i18n/pt.ts` (never hardcoded in a component; `en.ts` is key-parity-checked by the typechecker). Copy defined inside `domain/`/`contracts/` (gate/error messages) still renders PT-BR under an EN UI — translating it is a frozen-layer change.
- Listener-facing screens: max ONE short instruction line, one dominant action, **no counters/numbers/IDs/tables**. Audio responds before text (bead click plays the bead; edge nudge plays ~1 s around the boundary only). Facilitator surfaces (dashboard, coverage drawer, setup) may be denser.
- Never punish: errors guide, warnings allow a second-click proceed, border-crossing offers choices.
- Respect `prefers-reduced-motion`; visible focus outlines; header sound toggle.

## Quality gates (all enforced in CI — a gate that isn't a required check doesn't exist)

Required checks on every PR, in order of importance. **The golden harness stood at the head of this list, described as the one gate that could never be relaxed, ever. It was not relaxed: it was removed outright in ENG-691, together with the artifacts it diffed** (see the section above). What follows is now the whole of it, and the job named `golden-harness` no longer exists in `.github/workflows/ci.yml`.

1. **Typecheck + lint** — zero errors; TS `strict: true`.
2. **Dependency direction** — enforced mechanically (dependency-cruiser or eslint-plugin-boundaries), not by convention: `domain/` imports nothing from contracts/adapters/ui; `contracts/` imports only `domain/`; `ui/atoms` and `ui/molecules` import no domain or adapters; only `ui/pages`/`ui/templates`/`ui/app` import adapters. A PR that violates a boundary fails CI — no exceptions list.
3. **Coverage, per layer (not global):** `domain/` ≥ 90% line+branch (this is the frozen core, and since ENG-691 it is the ONLY proof that core still matches the reference — every rule in PRD §11 gets an explicit test, including the edge thresholds: seam-move `max(3, 25%)`, partial bead, back-reach, reopen cascade); `contracts/` ≥ 90% (every schema has valid/invalid fixtures); `adapters/` tested against their fixtures; `ui/` has **no numeric threshold** — instead, interaction tests are mandatory for the interaction-critical organisms only (necklace click model, seam modal). No global coverage number: it invites padding.
4. **Complexity — warn, don't block.** Cyclomatic complexity > 15 emits a lint warning to flag for review. Not an error: the domain port mirrors reference logic 1:1, and mechanically splitting a faithful port to satisfy a number is worse than the number.

Anti-gaming rules (for autonomous sessions): never lower a threshold, delete a failing test, or add ignore-comments to pass a gate — if a gate seems wrong, stop and flag it in the PR instead. Snapshot tests don't count as domain coverage. Fixing a bug requires first adding the failing test that proves it.

## Workflow rules

- One Linear issue per session/PR. Use Linar suggested branch name. Small PRs.
- "Done" = unit tests green + lint/typecheck green + Linear issue updated with a one-line result.
- Never touch a module another active session owns. `contracts/` and `domain/` PRs require human review; `ui/` and `adapters/` (fixture-safe) may merge on green.
- Sacrifice order if time runs out: tutorial popup → animated guide (static human figure is acceptable) → audit-log UI. Domain and contracts never give. (TTS used to sit in that order; it left with the interview, ENG-689.)
- Never add telemetry/analytics on listener behavior. No network calls from `domain/`.
- **No AI-generated *content*, and as of ENG-691 no sanctioned model use at all.** No model ever touches the **story audio**, and no model ever classifies, decides, or invents meaning. That rule used to carry exactly three carve-outs, each hedged with four conditions (run by our API not the SPA; disclosed on the setup screen; a draft only; an unconfirmed draft never enters an artifact):

  1. **Interview voice** — spoke human-authored frozen strings from `domain/mapeamento-scripts.ts`.
  2. **STT of the voice answers** — an editable transcription draft, human-confirmed before it counted (confirmation in bulk allowed from 2026-08-12, gated by `reportExportStatus`).
  3. **PT→EN translation** — English derived from confirmed source text (ENG-370: the English itself was not separately confirmed).

  **All three were the interview's, and the interview is gone. The product therefore has NO model use whatsoever** — not one call, in the SPA or in our API, on this flow's behalf. This section is kept rather than deleted so a future reader knows the rule was **emptied by a scope cut** (ENG-689/ENG-691, owner decision 2026-09-01), not forgotten and not quietly widened. If the interview comes back, these three carve-outs and their four conditions come back with it, in writing, before any code.

  Still forbidden, and now without exception: a model transcribing, translating, or analysing the **story audio**; a model producing or suggesting a `scene_kind`, a confidence, or the meaning map (PRD v2 §1.1, §4, §8.7, §12, §14).

## Loop execution contract (read every iteration)

Feature work runs as an autonomous loop. Each iteration starts with fresh context, so obey this every time:

1. **Pick** the highest-priority *eligible* Linear issue in the MVP milestone. Eligible = all `blockedBy` are Done, and the issue carries neither `blocked-O8` nor `needs-human`. Never start an ineligible issue.
2. **Read** this file + the issue body (it is the complete brief) + the `docs/` sections it cites. Do not rely on prior-iteration memory.
3. **Stay in scope.** Touch only the files the issue's "Scope" lists. If you discover you must change another module, do NOT — open a follow-up issue and note it.
4. **Verify against the Definition of Done.** Every DoD checkbox must pass by running a command (tests, typecheck, lint, dependency-cruiser, coverage). Do not mark done on judgment.
5. **STOP and escalate — do not merge — when:** the issue is `contract-critical` (touches `contracts/` or `domain/`); the spec is ambiguous; or the DoD cannot be met in scope. Leave the PR open, comment the blocker on the issue, and move to the next eligible issue.
6. **Finish** one issue = one branch `feat/<issue-id>-<slug>` = one small PR. Update the Linear issue with a one-line result and the PR link. `loop-ready` issues may merge on green; `contract-critical` may not.
7. **Never** lower a gate, delete/skip a failing test, or add ignore-comments to pass (see Quality gates). A bug fix starts with the failing test that proves it.
