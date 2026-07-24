# Action Plan — Colar de Sons · **MVP scope & post-validation backlog**

**Audience of this document:** the product team and anyone planning work on top of the PRDs.
**Purpose:** define **what the MVP is** (the smallest product that validates the system), the **validation goals and acceptance criteria**, and **what deliberately waits** until after validation. This is a *scope* document in the PRD convention — it does **not** phase the engineering work (no sprints, milestones, or task breakdowns; that comes later, from this cut).
**Nature of the project:** the MVP is a **complete from-scratch implementation in a new stack** — a full project, not an increment on the prototype. The v1 `index.html` is carried forward only as the **executable reference** for behavior and output contracts; no prototype code is reused.
**Source of truth:** *PRD — Colar de Sons v2 (consolidated)*. Every item below references its section there. The *UI/UX Redesign PRD v2* governs presentation; the *as-built PRD v1* is the behavior reference for implementers.
**PRD language:** English; UI copy PT-BR.

---

## 1. What the MVP must prove (validation goals)

The v1 prototype already validated the **classification flow** in the field. What the MVP validates is the **system around it**:

1. **The platform holds a real work cycle.** A facilitator logs in, starts a session from a project audio, works it with a listener across more than one sitting, and retrieves the artifacts — without files traveling by hand and without losing work (PRD §4, §7).
2. **The oral-mode premise survives the platform.** Everything new is facilitator-facing; the listener experience remains ear-first and text-minimal even with accounts, sync, and dashboards around it (PRD §1.1, §9).
3. **The pipeline contract holds.** Artifacts produced through the platform are exactly the prototype's artifacts — the Compilador consumes them with zero changes (PRD §10).
4. **The new product works with real pairs.** The MVP *is* the full new product — new stack, Shemá design, necklace-as-transport, conversation Mapeamento with voice answers — validated with real facilitator + listener pairs. There is no "old version" to fall back on; the prototype is reference, not fallback.

---

## 2. MVP scope (in)

### 2.1 Platform
| Item | Spec | Notes |
|---|---|---|
| Login via shared API | §7.1 | Conforms to the API's existing auth standard; two roles (facilitator, project admin) |
| Sessions dashboard | §7.2 | List with status + progress; resume in-progress; **direct artifact downloads** for completed sessions; new-session entry |
| Persistent sessions | §7.3 | Continuous autosave of full state (incl. Mapeamento voice answers); resume from any machine; lifecycle *em progresso* → *concluída*; completed opens in review mode; single-editor advisory lock |
| Online-only connectivity | §7.3, §13 | On connection loss: editing pauses with a clear PT-BR warning, in-memory state preserved, playback keeps working |
| Audio from the project bucket | §7.4 | The **only** audio source in the MVP: browse/pick bucket audios **with their acousteme data** |
| Onboarding tutorial popup | §7.5 | Bottom-right contextual tips; dismissible for good; never touches the listener's decision area |

### 2.2 The classification flow (behavior frozen, skin new)
| Item | Spec | Notes |
|---|---|---|
| Session setup | §8.1 | Audio source + **granularity small/medium/large** (no numeric "segundos por conta") + slug + trust line |
| Escuta 1 & 2, Triagem, Segmentação | §8.3–§8.6 | Logic, gates, thresholds, and error-copy meaning exactly per PRD; presentation per redesign PRD (stepper, ceremonial escuta, card-grid picker, three-shape confidence, coverage drawer, seam modal) |
| Margins-only fine-tuning | §9.3 | Existing playEdge/hover behavior preserved and made legible (emphasized edge beads) |
| Mapeamento conversation | §8.7 | **100% of the question scripts** (11 L1 + 5 L2/scene incl. none_fit + 5 L3/phrase); human storyteller figure; spoken questions (speech synthesis pt-BR); **voice answers** (WebM/Opus per question key); editable report |
| Completion & artifacts | §8.8 | "A história está inteira no colar." + three explained document cards; artifacts stored server-side on completion |
| Pipeline imports | §8.9 | Delivery (proposed/unlocked) and return (confirmed/locked) JSON, with manifest-mismatch warning |

### 2.3 Contracts & security
| Item | Spec | Notes |
|---|---|---|
| Output identical to the v1 prototype | §10 | Byte-for-byte given the same decisions; the prototype HTML is the executable reference — this is the MVP's hardest acceptance gate |
| Security baseline | §12 | Project-scoped access enforced server-side; TLS + encryption at rest; consent (pipeline-use consent at session start; collection consent read from the bucket audio's metadata where present); **access/download audit logging**; no voice data used beyond the pipeline; no listener telemetry |
| Trust copy | §5 | "Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso." |

### 2.4 O8 — CLOSED
The **acousteme → bead-duration derivation rule** and the acousteme payload shape (§15.2 O8) landed in ENG-242 / tripod-api PR #100: `beadSec = granularity_frames[level] × hop_sec`, with the tokenizer's fixed grid (hop 20 ms, 10/25/50 frames) for audios lacking acousteme data. Nothing is blocked on it. What remains is a pipeline **obligation**, not a gap: the acousteme params must be uniform per project so every audio resolves to the same `beadSec` (ENG-352) — the SPA refuses a divergent audio rather than cutting it on a second grid.

### 2.4b API workstream (parallel track — on the radar, to be scoped)

This effort is **two repositories meeting at the contract**, not a full-stack app: the Colar de Sons SPA **and** an extension of **`tripod-api`** (FastAPI/Pydantic/SQLAlchemy) with the persistence and endpoints the product needs. Key points, kept at the radar level (concrete DB models/DTOs/endpoints are a follow-up design discussion, PRD §15.2 O9, not specified here):

- **Contract-first via FastAPI's OpenAPI:** the API's Pydantic DTOs are the source of truth; the SPA generates its TS types from the emitted schema. Agreeing the DTOs early unblocks both tracks — the SPA builds against fixtures (§2.1), the endpoints build against the same DTOs, and they meet at the contract.
- **Persistence areas to design** (DB models + DTOs + endpoints, under `tripod-api` conventions): sessions (autosave state + lifecycle + editor lock), audio+acousteme references, artifacts, consent records, audit log.
- **Platform TTS (decided 2026-07-13):** the interview's spoken prompts come from a **shared, app-agnostic TTS service** in `tripod-api` — a new `platform/` layer, not owned by any app. `POST /api/platform/tts/speak` takes `{text, language}` and returns raw `audio/mpeg` from an **ElevenLabs** voice, cached durably in a **generic bucket** keyed by content hash, so each question is synthesized **once, ever, for every app**. This replaces the browser speech synthesis (redesign O2) and consolidates the two already-forked ElevenLabs clients in the API (project-health and translation-helper). The SPA never contacts the provider — PRD v2 §12.
- **Opaque artifact storage (hard rule, PRD §10.5):** the API stores/serves the three artifacts as opaque bytes — never re-serialized — or byte-identity breaks.
- **Auth reuse:** the API's existing JWT scheme (O1 closed); no new auth work in the SPA.
- The API repo has its **own `CLAUDE.md` and conventions**; API sessions run separately from the SPA sessions, sharing only the contract.

### 2.5 Decided OUT of the MVP

| Item | Replaced by / rationale | Lands in |
|---|---|---|
| Oral Collector library integration | The **specific bucket** is the audio source | Backlog #2 |
| Audio upload | Bucket-only keeps the MVP surface small; every bucket audio carries acoustemes | Backlog #3 |
| In-app project-admin surfaces | Membership/audio management happens in existing ecosystem tools for now | Backlog #5 |

---

## 3. MVP acceptance criteria (product-level)

The MVP is validated when, in real use (not demo):

1. **End-to-end cycle:** a facilitator + listener pair completes a real story — bucket audio → session → Escuta → Cenas → Triagem → Segmentação → Mapeamento (voice) → *concluída* — across **at least two sittings on different days/machines**, with zero manual file handling and zero lost work.
2. **Contract check:** given the same audio, grid, and decisions, the platform's `anchoring-return.json` and `bead-manifest.json` are **identical** to the v1 prototype's output, and the report `.md` keeps the exact skeleton/header; the Compilador ingests them unchanged.
3. **Dashboard retrieval:** the three artifacts of a completed session are downloaded from the dashboard without opening the session.
4. **Oral-mode review:** every listener-facing screen passes the §9.2 check (≤ 1 short instruction line, one dominant action, no counters/IDs/tables); the listener operates the session without reading beyond that line and without touching platform chrome.
5. **Interview completeness:** all scripted questions are asked by the conversation and every answer (voice or typed) lands in the report and in session storage under the correct key.
6. **Resilience events:** a connection drop mid-session and a re-login both end with no lost decisions; a second user opening a busy session gets the lock message and review mode.

---

## 4. Post-validation backlog (deliberately after the MVP)

Ordered by expected value, not by commitment:

1. **Offline tolerance** (§13) — revisit the online-only decision with field data: a local write-behind buffer with sync on reconnect, if connection drops prove frequent in real sessions. *The MVP's connection-drop warnings should log frequency (aggregate, non-listener telemetry) to inform this.*
2. **Full project audio library via the API** (§7.4 "beyond MVP") — generalize the specific bucket into the browsable Oral Collector library, with search and metadata.
3. **Audio upload** (§7.4) — upload as a secondary source, stored to the project; requires defining granularity fallback durations for audios without acoustemes.
4. **Project admin surfaces** (§3, §7.1) — a dedicated in-app admin UI for membership and audio management.
5. **Facilitator note on review flags** — an input for `flags[].note` (today always empty; the UI says "descreva o ajuste no chat"). Schema-compatible: the field already exists in the contract.
6. **Retention & compliance automation** (§12) — the MVP ships audit logging and manual deletion on request; automated retention SLAs, audit reporting, and community-withdrawal tooling mature after validation.
7. **Ecosystem conveniences** — artifact push directly to the Compilador (instead of download), session hand-off between facilitators, cross-story coverage views for the project.
8. **Graceful small-screen degradation** (§4 non-goal for mobile-first stands) — improvements only if validation shows real tablet/small-notebook use.

> **Removed from this list (2026-07-13):** *"Pre-recorded human question prompts — replace/augment speech synthesis with the facilitator's recorded voice."* The MVP now ships an **ElevenLabs voice** served by the platform's TTS service (PRD v2 §8.7; redesign O2, closed). The synthetic voice is the decision, not a step toward a human one, so there is no upgrade left to schedule. Note the tension this resolves against, deliberately: §8.7 still asks the guide to read as "a real, warm human being" — that requirement now rests on the animation and the voice's warmth, not on a human having recorded it.

Items here must not leak into the MVP without re-cutting this plan; conversely, nothing in §2 should silently slip out — the MVP is the smallest product that still validates §1.

---

## 5. Dependencies & risks to watch

| Dependency / risk | Impact | Mitigation |
|---|---|---|
| ~~**O8 undefined**~~ (acousteme rule + bucket payload shape) | CLOSED by ENG-242 | Residual risk: acousteme params that differ between audios of one project. Refused at Setup (ENG-352), never normalized |
| Shared API documentation (auth, bucket, session storage) | Blocks platform integration | §15.2 external dependency; request early |
| Contract regressions in the from-scratch build | Breaks the pipeline silently | The §3.2 identity check against the prototype becomes a permanent automated comparison, run on every change |
| Redesign completeness (all questions, human figure) | Mapeamento validation invalid if partial | §2.2 items are MVP scope, not polish; verify against the scripts in §10.4 of the PRD |
| Online-only in poor-connectivity field sites | Sessions interrupted | Accepted for MVP (decision O3); measure and revisit as backlog item #1 |

---

## 6. Related documents

- **PRD — Colar de Sons v2 (consolidated)** — all section references above.
- **PRD — UI/UX Redesign v2 (Shemá)** — presentation layer and prototype deliverables.
- **PRD as-built v1** — executable behavior reference (`index.html`) for the contract identity check.
