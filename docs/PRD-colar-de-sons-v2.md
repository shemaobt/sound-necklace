# PRD — Colar de Sons · **v2** (Product Requirements — consolidated)

**Audience of this document:** Developers, code agents, and anyone building on top of the product (this is the single centralized reference).
**Product:** Colar de Sons — the ear-first story segmentation and meaning-anchoring app of the Arquivo Oral (Shemá / Tripod) pipeline: a logged-in web platform with persistent sessions, project audio, and a dashboard.
**Status:** target specification for a **complete from-scratch implementation in a new stack** — a full project, not a retrofit of the prototype. The classification flow (§8) is **field-validated** — it was proven end to end by the v1 prototype with real facilitator + listener pairs; v2 specifies it as the product's core, together with the platform around it. The v1 `index.html` is carried forward only as the executable reference for behavior and output contracts (§10); no prototype code is reused.
**Companion documents:**
- **PRD — UI/UX Redesign v2 (Shemá)** — owns the visual/interaction layer (design tokens, "fio de contas" stepper, necklace-as-transport, conversation Mapeamento, storyteller guide). This document defines *what the product does*; that one defines *how it looks and moves*. Its §11 lists the **Claude Design deliverables** — the interface is already designed and prototyped (`Colar de Sons - Protótipo.dc.html` end to end, plus the exploration/comparison boards); those prototypes are the **normative visual reference for the from-scratch build** (behavior and contracts still come from *this* document and the reference `index.html`).
- **PRD as-built v1** — historical annex documenting the prototype implementation in code-level detail. Useful for implementers; not required to read this document.

**PRD language:** English. **All UI copy is PT-BR** (Brazilian Portuguese). PT-BR strings quoted here are literal, contract-level UI copy. **Exported artifacts are English** — see §1.1.
**Ecosystem:** authentication, projects, and audio are served by the **shared project API** (`tripod-api`, FastAPI/Pydantic/SQLAlchemy) — the same API that serves other systems, including **Oral Collector**, the companion field app that records/collects the oral audios. This effort spans two repos: the Colar de Sons SPA and an extension of `tripod-api` (§5, §15.2 O9).

---

## 0. How to read this document

- §1–§4: vision, problem, users, goals.
- §5–§6: ecosystem architecture and the domain model.
- §7: platform functional requirements (login, dashboard, sessions, audio sources, tutorial).
- §8: the classification flow — the field-validated core, specified step by step.
- §9: UX requirements (the oral-mode premise turned into acceptance criteria).
- §10: data contracts — **frozen**; shared with the downstream pipeline ("o Compilador").
- §11: rules quick-reference. §12: security & data protection. §13: non-functional. §14: out of scope. §15: decisions log & open items.

---

## 1. Vision & founding premise

Colar de Sons lets a facilitator and a native listener take a recorded oral story in an unwritten language and segment it *by ear* into a hierarchy:

**Colar (the whole story) → Cenas (scenes) → Frases (phrases/propositions) → answers about meaning (Mapeamento)**

The audio is sliced into a fixed grid of tiny **contas** (beads; default 0.25 s). Every boundary snaps to a bead index; bead indices are the universal coordinate system of the entire pipeline. The output is a set of artifacts (two JSON documents + a Markdown report) consumed downstream by an automated pipeline ("o Compilador" / Claude Code agents).

The app **never transcribes the story, never classifies vocabulary, never generates the meaning map**. It is a listening and anchoring tool: it collects human decisions and stores them as raw material. (The listener's *answers* may carry a machine transcription and a machine translation — but only as **drafts a human confirms**, and only under the three disclosed carve-outs of §4 and §12. The story audio itself is never touched by a model.)

### 1.1 The founding premise — oral mode, even in the bridge language

The core users have minimal contact with technology, and their minds work **orally**: their native language is only spoken — nothing written, nothing registered in text. They fill in the app's data in a **bridge language** (Portuguese), and the product must let them operate in **oral mode even in the bridge language**:

- **The less text and the more visual/audio resources, the better** — on every screen.
- Voice, color, shape, size, position, and motion are the primary channels of meaning; text is a facilitator channel. Any listener-facing text must justify its existence (§9.2).
- Technology contact is minimized: guided flow, one decision per moment, big stable targets, audio-first feedback. The listener never operates accounts, files, or navigation.
- Anything that looks like a form, a test, or an exam creates anxiety and distorts answers — the Mapeamento is a *conversation*, not a questionnaire.

**The bridge language is a working language, not the output language (decided 2026-07-23 — ENG-326).** Portuguese is how the listener speaks and how the facilitator works; **the artifact normalizes to English**. PT-BR and EN are both working languages of the app, but everything a session exports is English: any content captured in Portuguese enters an artifact only after a **PT→EN translation draft confirmed by a bilingual human** (§12). This reverses the earlier "the artifact follows the interface language" reading of this premise — the bridge carries the *conversation*, not the *contract*. The oral-mode premise is untouched by it: the listener still speaks Portuguese, still never reads or writes, and never sees, reviews, or is asked about the English text.

### 1.2 The central metaphor

The story is rendered as a **necklace of beads**: rows of pearls on a cord. Playback lights beads progressively; users touch beads to mark where segments start and end; confirmed scene endings render as **square beads** on the cord. The metaphor is culturally legible and field-validated — it is the soul of the product. The necklace is the map, the selection tool, the transport, the progress feedback, and the cultural anchor.

---

## 2. Background & problem

The Arquivo Oral project works with stories told in languages that have no writing system. To feed the downstream compilation pipeline (which maps oral stories against the "Ruth ontology" of scene kinds and builds meaning maps), someone must:

1. Anchor the story's internal structure — scenes and phrases — to precise positions in the audio.
2. Classify each scene against a controlled ontology (or record that nothing fits).
3. Collect the listener's own account of what the story and its parts mean.

Text-based tools fail here: the listener may not read fluently, or at all. The bead-necklace, ear-first interaction carries all three tasks end to end — proven in the field. What the validated flow lacked was a platform around it: work persisted only in downloaded files, audio arrived by hand, and results required navigating to the end of a session. v2 supplies that platform.

---

## 3. Users & roles

Two people share one screen (a notebook/desktop; mouse + keyboard) during a session:

- **Facilitator** (e.g. "Marcia") — literate; logs in, creates and resumes sessions, picks or uploads audio, downloads artifacts, handles imports and edge cases; reads the denser surfaces (coverage data, IDs, hashes, dashboard). All platform surfaces are facilitator surfaces.
- **Listener/respondent** (e.g. "Jean") — a speaker from an oral culture; may not read fluently or at all. The listener makes the actual segmentation and meaning decisions *by ear*. **Never authenticates, never sees platform chrome**; inside a session the listener-minimalism rules (§9.2) govern.
- **Project admin** — manages project membership and the project's audio library. (Role model decided: two app roles — facilitator and project admin — mapped onto the shared API's equivalent roles; §7.1. **MVP note:** there are no in-app admin surfaces in the MVP — admin tasks happen in existing ecosystem tools; a dedicated admin UI is post-validation.)

A user belongs to one or more **projects**; everything they can see — audios, sessions, artifacts — is scoped to their projects (§12).

**Design constraint #1 — design for ears, not for eyes-on-text** (§1.1, §9).
**Design constraint #2 — the exported data is a frozen contract** (§10). The pipeline depends bit-for-bit on the schemas, IDs, value vocabularies, and gates.

---

## 4. Goals & non-goals

### Goals
1. Carry the field-validated, four-level ear-first classification flow (Escuta → Cenas → Triagem → Segmentação → Mapeamento) unchanged in behavior.
2. No work is ever lost: sessions autosave continuously and resume from any machine.
3. Audio flows from the project: pick an audio (with its acousteme data) from the project bucket, or upload — no file juggling.
4. Results are one click away: completed sessions expose their artifacts directly from the dashboard.
5. The oral-mode premise governs every listener-facing decision; everything platform-new is facilitator-facing.
6. Voices and stories are protected: security and LGPD compliance as first-class requirements (§12).
7. Produce pipeline-consumable artifacts bit-identical to the established contracts (§10), **in English**: PT content reaches an artifact only as human-confirmed English text (§1.1, §12).

### Non-goals
- AI-generated **content**, outside three named carve-outs. The app never invents anything the story contains or the listener said; no model ever touches the **story audio**, and no model ever classifies a scene, assigns a confidence, or builds the meaning map. The three carve-outs — (1) the synthetic **question voice**, (2) **speech-to-text** of the voice answers, (3) **PT→EN translation** — share four conditions: each runs **on our own API and never inside the SPA**, each is **disclosed on the setup screen**, each produces a **draft** whose authority is a human's confirmation, and **an unconfirmed draft never enters an artifact** (§8.7, §12). The question voice creates no content at all: it reads **human-authored frozen strings** (§10.4). STT and translation create *drafts of what a human already said or wrote* — the human confirms, and only the confirmed English text is exported (§1.1).
- Changing the Ruth ontology, coverage targets, or confidence model.
- Telemetry or analytics on listener behavior.
- Mobile-first layout (desktop-first; graceful degradation is enough).
- Building a user database — identity and membership are owned by the shared API.
- Managing audio recording — that is Oral Collector's job.

---

## 5. Ecosystem & architecture

- **Client:** the Colar de Sons web app, rendered in the Shemá redesign. **Audio processing is client-side:** decoding (Web Audio), the bead grid, and the `manifest_id` hash are computed in the browser, exactly as specified in §6.1–§6.2. Playback, selection, and all by-ear interaction are local and instant.
- **Custody is cloud:** audio files, session state, and artifacts live server-side, scoped to projects (decision: *nuvem completa*). The client streams/loads audio from the API and syncs session state to it.
- **Shared project API (`tripod-api`):** owns identity/auth, projects and membership, audio storage (in the MVP: a **specific bucket** holding the audios together with their **acousteme data** — §7.4), session storage (state + artifacts), and authorization. Stack: **FastAPI + Pydantic v2 + SQLAlchemy 2 (async) + Alembic + Postgres (Neon)**, JWT auth. Colar de Sons is one of several client systems of this API.
  - **This project's effort spans two repositories that meet at the API contract:** the Colar de Sons SPA (this document's product) **and** an extension of `tripod-api` with the persistence and endpoints this product needs. The SPA is not full-stack; the server work lives in `tripod-api` under its own conventions (thin routers, service-owned data access, Alembic migrations, Pydantic DTOs).
  - **Contract is code-first OpenAPI.** FastAPI emits the OpenAPI schema from the API's Pydantic models + routes; the SPA generates its TypeScript API types from that emitted schema. The API's Pydantic DTOs are the single source of truth for the wire contract; agreeing them early unblocks both tracks (build the SPA against fixtures, build the endpoints against the same DTOs, meet at the contract).
  - **New persistence is required** (sessions, audio+acousteme references, artifacts, consent, audit — §12). The concrete DB models and DTOs are **deliberately not specified here** — they are on the radar to be designed within `tripod-api`'s conventions (see §15.2 O9).
- **Oral Collector:** the companion field app that records/collects oral audios into the project. Colar de Sons consumes its recordings via the API.
- **Artifacts** are plain files (§10) wherever they travel — downloaded from the app, downloaded from the dashboard, or fetched by the pipeline via the API. **The API stores and serves them opaquely (§10.5)** — it must never re-serialize an artifact, or byte-identity breaks.

**Trust copy (decided).** The product promises, prominently at session setup: *"Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso."*

---

## 6. Domain model & core concepts

### 6.1 The bead grid & acousteme-driven granularity
- `beadSec` — seconds per bead, **uniform** across the story. The user never types a number, and since **ENG-352 they do not pick one per session either**: the **granularity level** — *small / medium / large* (PT-BR: "Pequena / Média / Grande") — is a **property of the project**, set once on the project settings screen by a `project_admin`, and the system resolves it to a concrete uniform `beadSec` per audio. Setup displays the project's level read-only.
- **Acoustemes** are the data responsible for audio granularity. They accompany each audio retrieved from the project bucket (§7.4). For bucket audios, each granularity level maps to a uniform bead duration **derived from that audio's acoustemes** (derivation rule: §15.2 O8). For audios lacking acousteme data (an edge case in the MVP, where all audios come from the bucket; the normal case for post-MVP uploads), the levels map to fixed fallback durations (values: §15.2 O8; the v1 prototype's 0.25 s is the reference for *medium*).
- Whatever the level resolves to, the grid math is unchanged and contract-frozen: the decoded duration is sliced into `floor(dur/beadSec + 1e-9)` beads, plus one final **partial bead** if a remainder `> 1e-9` exists. Each bead is `{ index, startTime, endTime }` (times to 6 decimals; `endTime` clamped to the duration). `beadSec` must be > 0.
- Changing the granularity after anchoring shifts every boundary. Since ENG-352 this is enforced, not warned: the project's level **freezes once the project has a session** (the API answers `409 PROJECT_GRANULARITY_LOCKED`), because moving it would either contradict the `bead_sec` already stamped — leaving the project unable to open another session — or split the corpus across two coordinate systems. Re-cutting a project at a new granularity re-derives every `manifest_id` it has exported: a migration, not a setting.
- **Grid divergence is refused, not normalized.** The level is the project's, but the duration comes from each audio's own acousteme. If an audio would resolve to a different `bead_sec` than the one the project is stamped with, Setup blocks the creation and explains. Normalizing to the stored value would break the O8 rule.

### 6.2 `manifest_id` — the audio+grid fingerprint
FNV-1a 32-bit hash (offset basis `0x811c9dc5`, prime `0x01000193`), byte-mixed over, in order: channel count; sample rate (low 2 bytes); sample count (4 bytes LE); the channel-0 PCM samples **strided** (`stride = max(1, floor(N/100000))`), each sample quantized to a clamped int16, 2 bytes LE; the bead duration in ms (3 bytes LE). Serialized as `fnv1a32:xxxxxxxx` (8 lowercase hex). It fingerprints the *audio + grid pair* across the pipeline and is checked on every import (§8.9).

### 6.3 The hierarchy and its IDs
- **Colar / whole story** — one scene object (`scene_id "S1"`); its span must cover beads `0 … N−1` to be confirmable.
- **Cenas (scenes / "parts")** — `part_id` allocated as the lowest free `PT#` (`PT1, PT2, …`). On export each locked scene additionally receives a **sequential** `scene_id` `"S"+n` in list order.
- **Frases (phrases / propositions)** — `prop_id` is the lowest free `P#`; `part_link` holds the owning scene's `part_id`.
- **Spans** are inclusive bead ranges, exported as `{ start_bead, end_bead }`.

### 6.4 The locked frontier (frontier + seam semantics)
Segmentation is **sequential from a locked frontier**:
- Scenes: the frontier is `max(locked scene end) + 1` (floor 0, capped at the last bead). A new scene's start is **pre-anchored at the frontier**; the user only decides where the scene *ends*.
- Phrases (inside the active scene): the frontier is `last locked phrase end in this scene + 1`; if the scene has no phrases yet, the **first phrase may reach back** to the *start of the previous neighboring scene* (start-of-scene test) — otherwise the scene's own start.
- Reopening item *i* unlocks *i and everything after it* (frontier integrity).

> **Post-lock editing (owner decisions, supersede "reopen"):** since ENG-342 there is no "reopen". A locked scene/phrase is adjusted by **dragging its END** (one handle per segment; the start is the seam) and the **next segment follows** (Pac-Man/tiled — no gaps), or **removed** (the next segment absorbs the freed space). Scene and phrase behave **identically**. Playback while segmenting is also owner-specified: while defining, clicking the start listens from there and clicking beyond only sets the END (the start is never settable); clicking a **confirmed** segment plays **from the tapped bead**; editing a boundary previews around the new limit. The full, authoritative rule set lives in **`docs/segmentation-rules.md`** — read it before touching segmentation interaction.

### 6.5 Productive scenes
A scene is **productive** when locked, spanned, and triaged to a real Ruth kind (`tag_state "tagged"` + `scene_kind`). Only productive scenes are phrased in Segmentação and get L3 questions in Mapeamento. `none_fit` scenes are *findings* (evidence toward a native scene type; the decision belongs to the facilitator → SC), not dead ends — they still receive L2 questions.

### 6.6 The Ruth ontology (scene kinds)
**27 scene kinds**, generated from `_spec/scene-kind-palette.json` (Compilador pin **5314907**, `scene_kind` axis) — **never hand-edited**; regenerate via `ferramentas/gen-scene-kind-palette.py`. Two tiers:
- **`ALTA` (rare — occurs 1× in Ruth), 19 kinds:** `BIRTH_SCENE, CONSENT_SCENE, DEPARTURE_SCENE, GATE_COURT_CONVENING_SCENE, GENEALOGY_SCENE, GLEANING_SCENE, INITIATIVE_SCENE, LAMENT_SCENE, MARRIAGE_SCENE, MEAL_SCENE, NAMING_SCENE, NARRATOR_INTRODUCTION_SCENE, NIGHT_APPROACH_SCENE, OPENING_CHRONICLE_SCENE, PROVISION_HOMECOMING_SCENE, REDEEMER_RECOGNITION_SCENE, REDEMPTION_DECLINE_SCENE, REDEMPTION_OFFER_SCENE, VOW_SCENE`.
- **`comum` (common), 8 kinds:** `APPEAL_SCENE, BLESSING_SCENE, INSTRUCTION_SCENE, RATIFICATION_SCENE, ARRIVAL_SCENE, BEREAVEMENT_SCENE, NARRATOR_FRAMING_CLOSE_SCENE, REPORT_SCENE`.

Values are **English in state and exports**; PT-BR labels are display-only (e.g. `GLEANING_SCENE` → "Respiga"), with the English value available on hover.

Coverage targets: `ALTA: 1` (displayed "1–2"), `comum: 3`. "Firm" counts are `high` + `medium` confidence; `low` counts separately as "hesitant". A rare kind with zero firm coverage is a **"candidato a ausência"**.

### 6.7 Confidence & tag states
- `scene_kind_confidence` stored values: `high` / `medium` / `low` (ENG-356 — the artifact is English; UI: "Certeza" / "Quase" / "Na dúvida" — rendered as the redesign's three-shape gesture: filled / half / dashed disc).
- `tag_state` values: `pending` / `tagged` / `none_fit`.

### 6.8 Sessions
A **session** is one story classification effort — audio + grid + hierarchy + triagem + mapeamento answers — created by a user inside a project. Lifecycle: *em progresso* → *concluída* (§7.3).

---

## 7. Functional requirements — platform

### 7.1 Authentication & entry
- Login against the shared API using its existing **JWT** scheme (python-jose Bearer tokens); Colar de Sons introduces no auth scheme of its own. The `AuthProvider` adapter targets this scheme.
- Successful login redirects to the **sessions dashboard** (§7.2).
- Expired/invalid auth returns to login; in-memory session state is kept so a re-login resumes without losing the current work.
- Login is a facilitator act; the listener is never asked to authenticate.
- **Roles (decided):** the app knows two roles — **facilitator** (creates/works sessions, downloads artifacts) and **project admin** (manages membership and the project's audios) — mapped onto the shared API's equivalent roles.

### 7.2 Sessions dashboard (post-login home)
Lists **all the user's sessions** across their projects:
- Per session: story name/slug, project, status (*em progresso* / *concluída*), last-modified time, and a glanceable progress indicator (natural fit: the redesign's "fio de contas" stations).
- **In-progress sessions:** open/resume directly into the current step of the guided flow.
- **Completed sessions:** the three artifacts — `anchoring-return.json`, `bead-manifest.json`, `mapping-report.md` — are **downloadable directly from the dashboard**, without opening the session and navigating to its final screen.
- **New session** creation lives here (audio source per §7.4).
- Facilitator surface: normal text density; PT-BR copy.

### 7.3 Sessions — persistence, resume, lifecycle
- **Create:** from an audio (§7.4) + grid parameters; segmentation happens client-side (§6.1–§6.2, §8.1).
- **Autosave:** the *full* session state persists server-side continuously — grid parameters, `manifest_id`, the whole hierarchy including in-progress/unlocked items, tag states and confidences, Mapeamento answers (text and voice recordings), review flags, and current mode/step. No user action is ever required to save.
- **Resume:** any in-progress session reopens from any machine at the point it was left. File-based JSON import/export (§8.9) remains for pipeline interoperability, not as the primary resume path.
- **Lifecycle:** *em progresso* → *concluída*. Completion materializes and stores the three artifacts server-side, byte-identical to §10. Reopening a completed session returns it to *em progresso*; artifacts re-materialize on the next completion.
- **Opening a completed session** defaults to **review mode** (§8.10) — play-only, with an explicit unlock to edit.
- **Concurrency (decided):** single active editor per session — an advisory lock; anyone else opening the session sees "sessão em uso por…" and may open it in review mode (play-only) instead.
- **Connectivity (decided): online-only.** A session requires an active connection. On connection loss, editing pauses with a clear PT-BR warning until the connection returns; state already in memory is preserved so nothing typed or anchored is lost while waiting. (Playback of the already-loaded audio keeps working — it is client-side.)

### 7.4 Audio sources

**MVP scope (decided): the project bucket is the only audio source.** Audios are retrieved from a **specific bucket**, each accompanied by its **acousteme data** (the granularity source, §6.1). The user browses the bucket's audios and picks one; no file handling on their machine. Bucket location, access, and the acousteme payload shape: §15.2.

**Beyond MVP:** (1) **audio upload** — file upload (WAV recommended; friendly decode-failure copy suggesting WAV PCM), stored to the project, with granularity via fixed fallback durations since uploads carry no acoustemes; (2) the bucket generalizes into the **project audio library** served by the shared API (Oral Collector recordings with acoustemes), keeping the same picking experience.

### 7.5 Onboarding tutorial popup (decided: in MVP scope)
A small, dismissible **tutorial popup anchored to the bottom-right corner**, offering short contextual tips ("como funciona esta etapa") as the facilitator moves through the flow.
- Facilitator-facing: may use text, but must never overlap or interrupt the listener's decision area.
- Dismissible for good ("não mostrar de novo", persisted per user); tips are per-step and short; no modal walkthroughs or forced tours.
- Priority: lowest within the MVP scope — it must never delay or complicate anything else; if something has to give, this gives first.

---

## 8. Functional requirements — the classification flow (field-validated core)

The flow below is validated with real users; implement its logic and sequence exactly. The redesign PRD dictates its presentation.

### 8.0 Modes, gates, and the guided flow

Four modes: **Escuta** (two internal steps: "Ouça a história" and "Corte a história em cenas"), **Triagem**, **Segmentação**, **Mapeamento** — shown to the user as the "fio de contas" progress stepper (six stations: Ouvir · Cortar · Triagem · Frases · Conversa · Guardar). The stepper is a **progress indicator, not free navigation**.

**The guided flow advances by itself:**
1. Creating the session and segmenting the audio lands on Escuta step 1.
2. Confirming the whole story ("Já ouvi a história completa") reveals scene-cutting.
3. "Confirmar as cenas →" advances to **Triagem**.
4. "Já classifiquei todas as cenas →" advances to **Segmentação**.
5. Finishing the last productive scene advances to **Mapeamento**.

**Mode gates:**
- Escuta — always available.
- Triagem — requires scenes confirmed (≥ 1 locked scene, whole story confirmed).
- Segmentação — requires ≥ 1 productive scene (attempts with zero productive scenes redirect to Triagem).
- Mapeamento — requires ≥ 1 productive scene **and** ≥ 1 locked phrase.

**The single traveling player.** There is exactly one player instance (necklace + play controls + confirm bar). It moves into the active step's slot so the necklace and its controls are always adjacent to the current decision; the relocation is an animated, legible transition. Changing modes stops playback.

### 8.1 Session setup — "Carregue o áudio"

Facilitator-only screen. Inputs: audio source (§7.4); story title/slug (falls back to the audio filename without extension). The **granularity level** is **displayed, not chosen** (ENG-352): it belongs to the project (§6.1) and is set on the project settings screen. There is no "Segundos por conta" numeric input — the v1 field is removed as irrelevant to users — and a project with no level yet sends the facilitator to configure it rather than defaulting to one. The trust line (§5) is pinned and prominent, and next to it the **machine-help disclosure** — plain language, facilitator-facing, naming all three carve-outs of §12: the guide's voice is synthetic and the questions are written by people; answers may get a machine transcription; text may get a machine translation into English — and in both cases a person checks it before it counts.

**Segmentation:** validates inputs (audio chosen: "Escolha um arquivo de áudio primeiro."; the resolved bead duration must be > 0 — an internal guard, since the user picks a level rather than a number); decodes ("Não consegui decodificar este áudio (…). Tente um WAV PCM." on failure); builds the bead grid; computes `manifest_id`; initializes the session; enters Escuta step 1.

**Optional imports** (pipeline interoperability, §8.9): load a project *delivery* JSON (proposed spans, to confirm by ear) or *resume* a return JSON.

### 8.2 The necklace & player — shared interaction machinery

- **Rendering:** beads in wrapped rows; confirmed scene *end* beads render **square**; played beads take the lit/trail treatment; beads of placed segments are tinted with the segment's identity color (scene palette while cutting scenes, phrase palette while phrasing — palettes per the redesign PRD §4.2).
- **The necklace is the transport** (redesign decision): tap any bead to play from there; the glowing head bead pauses; a large play button remains as the obvious "play from the start" affordance.
- **Selection click model (when an anchoring is active):**
  1. First click → sets pending start; **that single bead plays** (with a visual ping).
  2. Second click → sets the range (order-normalized); **the whole range plays**.
  3. Further clicks → nudge the **nearest edge** to the clicked bead; only **~1 s around the moved boundary plays** (`max(1, round(1/beadSec))` beads each side) — "the ear decides", never the whole scene again (§9.3).
  - Clicks are clamped to `[frontier, end of story]`. With no active anchoring, bead taps are transport only.
  - **A bead belonging to an already-locked item is heard, not cut:** tapping it plays that whole item (scene/phrase) as a toggle — tapping again, or tapping the glowing head, pauses. Only beads past the frontier take part in cutting. This is what makes a finished cut reviewable without reopening (and therefore destroying) it. *Built for scenes (Escuta 2, ENG-293) and phrases (Segmentação, ENG-296); the glowing-head pause holds for any playback since ENG-297.*
- **Hover edge preview (mouse only; field-requested):** dwelling ~280 ms within ±1 bead of a selection edge plays that boundary without changing it; re-arms after the pointer leaves the edge's proximity.
- **Selection band:** a band under the pending range with the two **edge beads emphasized** — the emphasis doubles as the discoverable "touch here to hear the seam" affordance (§9.3).
- **Playback is a toggle** (play ⇄ pause ⇄ continue) wherever it lives; exactly one thing plays at a time and every surface reflects global playback state. Re-tapping what is already playing — the same bead span, the same control — pauses it.
- **The sound comes from the beads, not from buttons** (owner decision, ENG-291): the stations carry no play buttons and saved items carry no ▶ chip. A saved item is reviewed by tapping its beads on the necklace (above); the interview player and the report playback are the carve-outs, being neither necklace nor cut.
- **Confirm bar:** a single, unmistakable contextual confirm action ("✓ Confirmar esta cena" / "✓ Confirmar esta frase"); hidden when nothing is anchoring. Errors and offers render directly beneath it.

### 8.3 Escuta step 1 — "Ouça a história."

The full necklace renders; the whole audio plays with beads lighting progressively. One decision: **"Já ouvi a história completa"** — no partial confirmation; the whole span `0 … N−1` must be covered ("O áudio precisa cobrir a história inteira — da conta 0 à conta N−1." otherwise). A "Reabrir" affordance reverses the confirmation. Presentation: the ceremonial full-bleed treatment of redesign §6.2.

### 8.4 Escuta step 2 — "Corte a história em cenas."

- A new scene opens automatically with its start **pre-anchored at the seam** (previous end + 1). The user's only decision is where the scene **ends** — instruction copy: *"Toque no colar onde esta cena termina. O começo já está costurado."* Once ≥ 1 scene is locked the second sentence gives way to the replay affordance (never a third sentence — §9.2 allows one line): *"Toque no colar onde esta cena termina. Toque numa cena pronta para reouvir."*
- **"✓ Confirmar esta cena":** requires a completed selection ("Clique onde a cena termina, no colar.") starting at/after the frontier ("A cena não pode começar antes da conta X."). On success the scene locks, its end bead turns square, and the next scene opens pre-anchored at the seam (animated).
- **Confirmed scene list:** compact chips — swatch · "Cena N" · Reabrir. The chip is a named group, not a control: to hear a confirmed scene, tap any of its beads on the necklace (§8.2). Reopening scene *i* unlocks *i* and everything after it.
- **"Confirmar as cenas →":** requires ≥ 1 locked scene ("Confirme ao menos uma cena."); discards any unlocked/empty trailing scene; advances to Triagem.
- "← Voltar" returns to step 1 (scenes preserved).

### 8.5 Triagem — "Essa cena é sobre o quê?"

- **One scene in focus at a time**, with per-scene progress dots doubling as jump targets; "▶ Ouvir esta cena"; the current tag state always visible (pending / kind + confidence / "⌀ nenhum se encaixa").
- **Picker** (per redesign §6.4): a *"Mais comuns"* card grid, a *"Ver todos os tipos por tema"* disclosure exposing all 27 kinds grouped in 6 themes, and a persistent dashed **"⌀ Nenhum se encaixa"** card. A text filter exists as facilitator convenience. All 27 kinds + none-fit reachable; stored English values untouched.
- **Confidence** is a first-class gesture, not a dropdown: three cards — Certeza / Quase / Na dúvida — whose filled / half / dashed disc carries the meaning without reading (§6.7).
- **None-fit** marks the scene `none_fit` — a *finding* ("evidência para nomear um tipo nativo quando o padrão se repetir"), not a dead end.
- **Coverage — facilitator-only drawer** ("Cobertura · só facilitadora"): productive count; per-kind firm/hesitant counts vs. targets; open rare kinds as "candidatos a ausência". Invisible to the listener until opened.
- **Hard gate — "Já classifiquei todas as cenas →":** enabled only when every scene is non-pending **and** ≥ 1 scene is productive. Helper copy: "Classifique todas as cenas (ou marque “nenhum se encaixa”) para seguir." / "Nenhuma cena se encaixa em Rute — escolha outra história."
- **All-none-fit lockout:** if every scene is triaged and none is productive, Segmentação and Mapeamento stay locked and the app explains: this story yields no Ruth coverage — choose another story; the marks are saved as native-type evidence. (Message meaning is contract; wording may be restyled.)

### 8.6 Segmentação — phrases inside a scene

- Work happens **one productive scene at a time**. Title: "Cena N · <PT-BR kind label>". Primary button: "Pronto com esta cena →" / on the last scene "Já segmentei todas as cenas →".
- **Windowing:** the necklace shows only the active scene plus a margin of `max(3, round(2/beadSec))` beads (~2 s) each side; outside beads are dimmed/asleep; a dashed band marks the awake scene; "▶ ouvir a cena" plays the scene only.
- **Phrase anchoring** follows the frontier logic (§6.4), including the first-phrase back-reach. Validation copy: "Clique onde a frase termina, no colar." / "A frase não pode começar antes da conta X." / "A frase precisa terminar dentro do colar."
- **Border-crossing flow — logic verbatim.** If the selection crosses the scene border, the app *guides instead of blocking* (presented as the redesign's visual seam modal). With `delta` = overshoot in beads, `thr = max(3, round(0.25 × scene length))`, `consumed` = the neighbor would be fully swallowed, `twoProd` = the neighbor is productive **and already has locked phrases**:
  - **Escalation (`twoProd`):** moving the border would touch two productive scenes — options: **Voltar à Triagem** / **Reancorar dentro da cena** only.
  - **Large overshoot (`consumed` or `delta > thr`):** looks like a scene re-cut, not a border adjustment — options: **Voltar à Triagem**; **Mover mesmo assim** (only when not consumed); **Reancorar dentro da cena**.
  - **Small overshoot:** offer **Mover a borda até aqui** / **Reancorar dentro da cena**, with one line explaining the consequence ("A cena de hoje cresce, a vizinha encolhe").
  - **Moving** slides the shared seam: this scene grows to the selected bead; the immediate neighbor shrinks accordingly; the phrase then locks.
- **Locked phrase list** (active scene only): chips — swatch · "Frase N" · Reabrir · **⚑ revisar** (exports as `NEEDS_REVIEW`) · Remover. As with scenes, a locked phrase is heard by tapping its beads (§8.2), not by a chip control.
- **Empty-scene soft warning:** leaving a scene with zero phrases warns once ("Esta cena ficou sem frases. Clique de novo para seguir mesmo assim."); a second click proceeds.
- **Navigation:** back goes to the previous productive scene, or to Triagem from the first; finishing the last scene advances to Mapeamento.

### 8.7 Mapeamento — the conversation

A guided **conversation, not a questionnaire** (redesign §6.6): full-bleed ceremonial stage; an animated **storyteller guide** that must read as a **real, warm human being** (not abstract or geometric — it looks at the user, breathes, blinks, and lip-syncs); "Ouvir a pergunta" speaks each question aloud (**decided: an ElevenLabs voice**, synthesized and cached by the platform's shared TTS service — one *native* voice per UI language, so the spoken language never diverges from the displayed one; the browser's own speech synthesis survives **only as a fallback** when the API is unreachable. The app never contacts the provider directly — §12); one question at a time; the listener **answers by voice** (mic button, live waveform, ouvir / de novo; recorded with MediaRecorder as **WebM/Opus**, one file per question, stored as session resources named by question key — `respostas/level1/<k>.webm`, `respostas/level2/<part_id>/<k>.webm`, `respostas/level3/<prop_id>/<k>.webm`); typing is the optional facilitator channel ("a facilitadora pode escrever depois — nunca por você"); progress is a thread of beads, one per question; facilitator-led questions carry a **wordless role marker**.

**The conversation must carry 100% of the question scripts** — order and wording exactly as in §10.4:
- **Level 1 — the whole story:** 11 questions, one per screen, with "▶ ouvir a história".
- **Level 2 — every locked scene, including `none_fit`:** 5 questions per scene, with "▶ ouvir a cena".
- **Level 3 — every locked phrase in productive scenes:** 5 questions per phrase, with "▶ ouvir a frase".
- Facilitator-led questions (the significant-absence questions) keep their notes ("conduzida pela facilitadora — nunca preencha por conta própria") and role marker.
- The answer store extends lazily so late structural changes (reopened scenes, added phrases) never lose existing answers.

**The report:** a consolidated, **editable** artifact — every question as a card with its answer (voice row with play + waveform + duration, or text, or "ainda sem resposta gravada"), plus an optional facilitator note per question. Exports `<slug>-mapping-report.md` with the exact skeleton and header contract of §10.4. The app collects **raw material only**: it never classifies vocabulary, never fills in absence, never generates the map.

**Transcription & translation drafts (decided — ENG-326).** A voice answer may carry a **speech-to-text draft** and, on top of it, a **PT→EN translation draft** — both produced by our own API (§12), both **editable in the report**, and both shown as *drafts* until a human confirms them: the facilitator (or the listener, aloud, through the facilitator) confirms the transcription; a **bilingual** human confirms the translation. Nothing here is ever put to the listener as a reading task (§1.1). **Confirmed English text is an export requirement, and a recorded answer without it blocks export (decided — ENG-327).** The exported report carries the confirmed English, never a draft, and **never the recording** — the `.webm` is provenance only, kept in the bucket but out of the `.md` (§10.4). So a **recorded** answer whose English is still unconfirmed is *invalid for export*: exporting it would write `_(no answer)_` and silently lose what the listener said. The facilitator clears the block by confirming the draft, or — always available, so there is no deadlock — by typing/translating the answer by hand. A question with **no** recording is the different case: it simply stays `_(no answer)_` and blocks nothing. *(The contract-level rendering and field naming of that English text is a frozen-layer change owned by ENG-356 — §10.2, §10.4; the export gate itself is `reportExportStatus`, ENG-327.)*

### 8.8 Completion & artifacts — "Guardar os documentos"

Completion screen headed **"A história está inteira no colar."** with the full necklace shown strung. **Three document cards**, explained in human language:
- `anchoring-return.json` — **"As decisões de vocês"** (requires the whole story confirmed; warns how many phrases lack a locked end).
- `bead-manifest.json` — **"O mapa das contas"** (the exact pair for this audio).
- `mapping-report.md` — **"A conversa sobre o sentido"**.
Each card has a "Baixar" → "baixado" state. Completing the session stores all three server-side (§7.3) — they remain downloadable from the dashboard forever after.

### 8.9 Pipeline imports

- **Delivery JSON** ("Carregar entrega do projeto"): loads *proposed* spans **unlocked** — "confirme de ouvido" — including `scene_kind`/`tag_state` prefills and phrase `statement` / `qa_readback` texts (English — ENG-356). A `manifest_id` mismatch warns: "Atenção: o manifest_id da entrega não bate com o do áudio. A grade pode estar diferente."
- **Return JSON** ("Retomar retorno salvo"): loads *confirmed* spans **locked**, with `NEEDS_REVIEW` flags re-applied.
- Both require the session's audio to be segmented first; both remain accessible from session setup at any time (they are interoperability paths — §7.3's autosave is the primary persistence).

### 8.10 Review mode

A locked state for revisiting work: banner "🔒 Modo de revisão — a segmentação está travada.", segmentation frozen, play-only; "Destravar para editar" exits. Entered by default when opening a *concluída* session (§7.3).

---

## 9. UX requirements — the oral-mode premise as acceptance criteria

1. **Ear-first.** Every interactive element the listener uses responds with sound before (or instead of) text: single bead on first touch, full range on second, boundary window on nudge/hover, spoken questions in the conversation. Subtle UI sound design (bead click, seam lock, confirmation chime) is welcome, gated by a header sound toggle and reduced-motion/sound preferences.
2. **Text minimalism — "quanto menos texto, melhor" (acceptance criterion).** Every listener-facing screen carries **at most one short instruction line** and one dominant action; no counters, numbers, IDs, hashes, or tables on listener surfaces. Prefer replacing text with an audio or visual equivalent wherever one exists. Dense information lives only in facilitator-scoped surfaces (coverage drawer, dashboard, imports). Design review of any new screen asks first: *"what text here can be removed or converted to audio/visual?"*
3. **Margins-only listening in scene fine-tuning.** When adjusting a scene or phrase boundary, the user hears **only the margins (start/end)** being adjusted — never forced to re-listen to the whole segment. Mechanics per §8.2 (edge-nudge window + hover preview); the affordance must be *legible without instruction text* (emphasized edge beads on the selection band).
4. **One decision per moment.** The guided flow enforces it structurally; the visual layer enforces it optically — one dominant action, everything else quiet.
5. **Never punish.** Errors guide ("Toque no colar onde a cena termina."); warnings allow proceeding on a second confirmation; border-crossing offers choices instead of blocking.
6. **The necklace is the hero.** Invest the signature effort there: pearl materiality, the lit trail, square end-beads, the dimmed window, the sliding seam.
7. **A human guide.** The Mapeamento storyteller figure reads as a real, warm human being (§8.7); animations gentle and reduced-motion-safe.
8. **Visual system:** all tokens, palettes, motion, and state vocabulary per the redesign PRD (§4 there) — Shemá Design System. The **Claude Design prototypes** (redesign PRD §11) are the normative reference for presentation: when this document and a prototype disagree on *behavior or data*, this document wins; when they disagree on *look, layout, or motion*, the prototype wins.

---

## 10. Data contracts — the frozen core (do not touch)

These are shared invariants with the downstream pipeline. Any change requires a versioned contract change coordinated with the pipeline owner.

**Normative reference — extremely important:** the output of v2 must be **exactly identical** — same schemas, same field names, same ID rules, same value vocabularies, same semantics — to the output produced by the v1 prototype (`index.html`). The prototype is the executable reference implementation of this contract: given the same audio, grid, and decisions, v2's exported files must match the prototype's byte for byte. The schemas below transcribe that contract; in any doubt or discrepancy, **the prototype's behavior wins**. Note that the acousteme-driven granularity (§6.1) does not touch this contract: it only *selects* the uniform `bead_duration_sec`; the grid math, the manifest schema, and the `manifest_id` hash are unchanged.

### 10.1 `<slug>-bead-manifest.json`
```json
{
  "manifest_id": "fnv1a32:xxxxxxxx",
  "audio_filename": "…",
  "bead_duration_sec": 0.25,
  "total_beads": 1234,
  "beads": [ { "index": 0, "startTime": 0.0, "endTime": 0.25 }, … ]
}
```

### 10.2 `<slug>-anchoring-return.json`
```json
{
  "manifest_id": "fnv1a32:xxxxxxxx",
  "story_slug": "…",
  "scenes": [ {
    "scene_id": "S1",
    "confirmed_span": { "start_bead": 0, "end_bead": 1233 },
    "parts": [ {
      "part_id": "PT1",
      "scene_id": "S1",
      "scene_kind": "GLEANING_SCENE" | null,
      "scene_kind_confidence": "high" | "medium" | "low" | null,
      "tag_state": "pending" | "tagged" | "none_fit",
      "confirmed_span": { "start_bead": …, "end_bead": … }
    } ],
    "propositions": [ {
      "prop_id": "P1",
      "part_link": "PT1" | null,
      "confirmed_span": { "start_bead": …, "end_bead": … }
    } ]
  } ],
  "flags": [ { "kind": "NEEDS_REVIEW", "prop_id": "P3", "note": "" } ]
}
```
Rules: only **locked** scenes/phrases export; `parts[].scene_id` is sequential `S#` by list order (distinct from the stable `part_id`); the outer `scenes` array holds exactly one scene — the whole story.

**Artifact language (ENG-356, policy §1.1/§12):** every human-readable value and every field name in the artifacts is **English**. `scene_kind_confidence` therefore stores `high`/`medium`/`low` (the PT-BR words "Certeza"/"Quase"/"Na dúvida" are UI labels only), and the former `note_pt` is `note`. The legacy PT-BR values are **rejected** by the schema, not coerced.

### 10.3 Import shapes
- **Delivery:** same shape with `proposed_span` on parts/propositions, plus optional `statement` and `qa_readback` on propositions (both English — renamed from `statement_pt`/`qa_readback_pt` by ENG-356; the Compilador emits the new names).
- **Resume/return:** the return shape itself (`confirmed_span` ⇒ locked).

### 10.4 Mapeamento — question scripts & report skeleton (contract)

Scripts source: `docs/scripts/nivel-1-holistico.md`, `nivel-2-partes.md`. Order and PT-BR wording are fixed; the *script* is method, the *skin* is free. Each question carries **two frozen strings** (`domain/mapeamento-scripts.ts`): `q` — the PT-BR wording — and `q_en` — the English wording, which is what the report `.md` serializes (ENG-356). Both are human-authored; neither is ever machine-translated at runtime. The screen and the interview voice read whichever matches the UI language, and **only** those two: a question wording never exists a third time in `ui/i18n` (ENG-345, which found seven of the twenty-one drifted between a display translation and `q_en`).

**L1 (11):** `recontar` (whole), `arco_inicio_fim` (arc), `arco_muda` (arc), `lugar` (context), `tempo` (context; note: permita "não tem"), `saber_antes` (context), `sentimento` (tone), `ritmo` (pace), `funcao` (function), `prepara` (function; optional), `ausencia` (significant_absence; facilitator-led — "nunca preencha por conta própria").
**L2 (5, per locked scene incl. `none_fit`):** `descrever`, `quem` (beings_in_scene), `onde` (places_in_scene), `objeto` (objects_in_scene), `ausencia` (significant_absence; facilitator-led).
**L3 (5, per phrase in productive scenes):** `oque`, `quem`, `onde`, `como` (note: "se fizer sentido"), `o_que_mais`.

Answer store keying: `level1{k}`, `level2{part_id}{k}`, `level3{prop_id}{k}`.

**Report Markdown skeleton** (`<slug>-mapping-report.md`) — English since ENG-356; the *filename* stays as-is:
```
# Meaning Mapping Report — <slug>

> Raw material for Claude Code. This is **not** the map. Free-text answers …
> `source_domain: oral_archive` · `speaker_role: LISTENER_NOT_STORYTELLER` · manifest: `fnv1a32:…`

## Level 1 — the whole story
- **<question q_en>** _(field)_
  <answer | _(no answer)_>

## Level 2 — the scenes
### Scene N (SN) — scene_kind: <KIND | (none)> [none_fit]
- **<question q_en>** <answer | _(no answer)_>

## Level 3 — propositions (productive scenes)
### Scene N (SN) — <KIND>
**Phrase i (Pn) — beads s–e:**
- <question q_en> <answer | _(no answer)_>
```
The header contract lines (`source_domain: oral_archive`, `speaker_role: LISTENER_NOT_STORYTELLER`, manifest id) are non-negotiable.

**Voice answers — provenance, not artifact (decided 2026-07-23, ENG-356).** The cell is **text only**. A recording (`respostas/level1/<k>.webm`, `respostas/level2/<part_id>/<k>.webm`, `respostas/level3/<prop_id>/<k>.webm` — WebM/Opus, one file per question) stays in the bucket and in the session `meta.voice` as provenance, and remains playable in the on-screen review, but it **never appears in the `.md`**. An answer that exists only as audio therefore reads `_(no answer)_` until a human confirms its English text (§12).

### 10.5 Artifact custody — opaque storage (byte-identity rule)

The three artifacts are produced **client-side**, byte-identical to the v1 prototype (§10 normative reference). Every system that stores or transports them — the API, the dashboard download, the pipeline fetch — must treat them as **opaque bytes**: store what the client produced and serve it back unchanged.

- The API (`tripod-api`) must **not deserialize an artifact into a Pydantic model and re-serialize it**. Round-tripping through Pydantic/JSON can reorder keys or change formatting and silently break byte-identity (and the golden harness). Persist artifacts as opaque blobs/text; validate only the envelope around them (session id, `manifest_id`, filenames), never the payload's internal shape.
- The report `.md` is likewise stored/served verbatim — never re-rendered server-side.
- This applies to storage, download, and any pipeline hand-off. The artifact bytes that leave the browser are the artifact bytes the Compilador receives.

### 10.6 Artifact filenames (ENG-359)

The filenames are **English**, matching the artifact content (§10.2 "Artifact language"):

| kind (API handle) | filename |
|---|---|
| `manifest` | `<slug>-bead-manifest.json` |
| `anchoring` | `<slug>-anchoring-return.json` |
| `report` | `<slug>-mapping-report.md` |

An empty slug falls back to `story` for all three — the v1 reference's split fallback (`colar` for the JSONs, `historia` for the `.md`) did not survive the rename.

**The `kind` remains the contract handle**, not the filename: the API routes by `kind`, and the filename is the download label and storage key. This is what makes the rename tractable at all.

> ⚠️ **Cross-repo debt, open at the time of writing.** `tripod-api` still documents in its OpenAPI that "the stored FILENAMES stay Portuguese … the kind is the handle, not the file", and the Compilador still fetches the PT-BR names. The SPA moved first (ENG-359); the API and the pipeline must follow, ideally accepting both names on read during the transition. `contracts/openapi.json` is **generated** from the API and therefore still carries the old text — it is not hand-edited on purpose. Tracked in ENG-358.

---

## 11. Rules quick-reference

| Rule | Value / behavior |
|---|---|
| Bead duration | uniform; resolved from the audio's acoustemes at the PROJECT's granularity level small/medium/large (fallback: fixed values, medium ≈ 0.25 s); must be > 0, and must match the project's stamped `bead_sec` |
| Bead count | `floor(dur/beadSec + 1e-9)` + 1 partial bead if remainder |
| Whole-story confirm | span must be exactly `0 … N−1` |
| Scene start | pre-anchored at frontier (previous end + 1); user sets end only |
| Reopen semantics | reopening item *i* unlocks *i* and all later items |
| First phrase back-reach | may start as early as the previous neighbor scene's start |
| Border-move threshold | `max(3 beads, 25% of scene length)` |
| Border escalation | neighbor productive + has phrases ⇒ Triagem or re-anchor only |
| "Mover mesmo assim" | offered only when the neighbor isn't fully consumed |
| Coverage targets | rare (ALTA) 1 (shown "1–2") · common 3 — firm counts only |
| Firm vs hesitant | firm = `high`+`medium`; hesitant = `low` |
| Gate → Triagem | scenes confirmed (≥ 1 locked scene, whole confirmed) |
| Gate → Segmentação | ≥ 1 productive scene |
| Gate → Mapeamento | ≥ 1 productive scene AND ≥ 1 locked phrase |
| All-none-fit | Segmentação/Mapeamento locked; story yields no Ruth coverage; marks kept as native-type evidence |
| Empty scene | soft warning; second click proceeds |
| Edge play window | ~1 s each side (`max(1, round(1/beadSec))` beads) |
| Hover edge preview | mouse only; ±1 bead of an edge; ~280 ms dwell |
| Segmentação window margin | `max(3, round(2/beadSec))` beads (~2 s) each side |
| IDs | `PT#` parts (lowest free), `P#` propositions (lowest free), `S#` sequential on export |
| Artifacts require | return: whole story confirmed; manifest: grid exists |
| Session states | *em progresso* → *concluída*; completed opens in review mode |

---

## 12. Security & data protection

The data is unusually sensitive: **voices of speakers from small oral communities are personal — and effectively identifying — data**, and the stories may be culturally owned material. With full cloud custody, security is a first-class requirement set:

- **Legal baseline:** LGPD compliance (users and communities are in Brazil): lawful basis and recorded consent per speaker/story; purpose limitation (pipeline use only); data-subject rights (access, correction, deletion); a designated controller.
- **Consent (decided — two moments):** (1) **collection consent** is captured at recording time in **Oral Collector** and travels with the audio through the API — Colar de Sons displays/verifies that the audio carries it; (2) **pipeline-use consent** is confirmed at session start in Colar de Sons by the facilitator. Both moments admit an **oral form** (a recorded consent audio), consistent with §1.1.
- **Access control:** all audio, session state, and artifacts scoped to project membership (§3); no cross-project visibility; least-privilege roles; **server-side authorization on every resource** (never client-side only).
- **Encryption:** TLS for all transport; encryption at rest for audio, voice answers, and session data.
- **Voice-data handling:** recordings (story audio and Mapeamento voice answers) are never used for model training, voice identification, or any purpose beyond the pipeline; no third-party analytics or telemetry on listener behavior. **The story audio never leaves our control — no exception, no carve-out.** Where an *answer* recording is sent for transcription (below), the processor is bound by contract to no-training and zero-retention, and the same prohibition on identification carries through.
- **Synthetic question voice (decided — and its boundary):** the interview prompts are spoken by an **ElevenLabs** voice, synthesized and cached by **our own API** (§5, §8.7). The SPA never contacts the provider, and the provider **never sits in the session's data path**: no listener audio, no story audio, and no answer ever reaches it. What reaches it is only the *fixed, human-authored question text* (§10.4) — the same 21 strings for every session, cached after the first synthesis. **Disclosure is mandatory**, both because the provider's use policy requires it and because the honesty rule below demands it anyway: the setup screen states plainly that the guide's voice is synthetic and that the questions are written by people.
- **Speech-to-text of the voice answers (decided — and its boundary):** an answer recording may be transcribed into an **editable draft** (§8.7). It runs **through our own API** — the SPA never calls a transcription provider — and the transcript is **advisory data with no authority of its own**: a human confirms it, and until then it is not an answer, does not appear in an artifact, and never overwrites the recording, which remains the record of what the listener said. Sending answer audio out for transcription is the *only* case where listener audio leaves our systems; it goes to a processor bound to no-training and zero-retention, under the LGPD basis and consent recorded above, and it is **disclosed on the setup screen**. The **story audio is never sent** — it stays inside our control under every circumstance.
- **PT→EN translation (decided — and its boundary):** artifacts are exported in English (§1.1), so confirmed Portuguese text may be machine-translated into an **English draft**, again **through our own API only**. The draft is advisory: it must be **confirmed by a bilingual human** before export, an unconfirmed translation never enters an artifact, and the confirmed Portuguese it came from is retained as the source of truth for any later review. What reaches the translation processor is text a human already confirmed — never a recording. **Disclosed on the setup screen** with the other two carve-outs.
- **Auditability:** access and download of audios/artifacts is logged (who, what, when).
- **Retention & deletion:** defined retention policy; deleting a session/audio removes it and its derivatives from active storage within a defined SLA; communities/projects can request full withdrawal of their material.
- **Account/session hygiene:** per the shared API's standards — expiring sessions, secure credential storage, rate limiting.
- **Honest trust copy:** the setup trust line (§5) states exactly what the system does; it is a product requirement, not decoration.

---

## 13. Non-functional requirements

- **Client-side audio processing:** decode, bead grid, and `manifest_id` computed in the browser (§6.1–§6.2); by-ear interaction is local and instant regardless of network.
- **Performance:** responsive with multi-minute audio at 0.25 s beads (thousands of rendered beads).
- **Connectivity (decided): online-only.** Sessions require an active connection (§7.3). On a drop, the app pauses editing with a clear PT-BR warning, preserves in-memory state, and resumes when the connection returns; client-side playback of the loaded audio keeps working meanwhile. The guide's spoken question comes from the API (§8.7), so a drop silences it — the browser's own speech synthesis takes over as the fallback, and the story audio (already decoded locally) is unaffected.
- **Accessibility:** visible `:focus-visible` outlines; `prefers-reduced-motion` respected (decorative loops disabled); comfortable base text size for facilitator UI; a header **sound toggle** muting all UI sound.
- **Desktop-first:** notebook screens, mouse + keyboard, two people side by side; graceful degradation elsewhere.

---

## 14. Out of scope

- AI-generated **content** beyond the three carve-outs of §4 and §12 — nothing about the story is ever transcribed, translated, or analysed by a model; nothing is ever invented; no model classifies a scene or builds the meaning map. Inside the carve-outs, the model only drafts: the question voice reads human-authored frozen strings, and STT/translation restate what a human already said — a human confirms, and an unconfirmed draft never reaches an artifact (§1.1, §8.7).
- Changing the Ruth ontology, coverage targets, or confidence model.
- Telemetry/analytics on listener behavior.
- Mobile-first layout.
- Recording audio in the field (Oral Collector's job) and managing identity/membership (the shared API's job).

---

## 15. Decisions log & open items

### 15.1 Resolved decisions (July 2026)

| # | Question | Decision |
|---|---|---|
| O1 | Auth mechanism | **JWT** — the shared API's existing scheme (python-jose Bearer tokens); the SPA's `AuthProvider` adapter targets it, introducing no scheme of its own (§7.1). |
| O2 | Role model | **Minimal:** two app roles — facilitator and project admin — mapped onto the API's equivalent roles (§3, §7.1). |
| O3 | Field connectivity | **Online-only.** Sessions require an active connection; on a drop, editing pauses with a clear warning, in-memory state is preserved, and work resumes on reconnect (§7.3, §13). |
| O4 | Concurrent editing | **Single active editor** per session via advisory lock ("sessão em uso por…"); others may open in review mode (§7.3). |
| O5 | Voice-answer storage | **WebM/Opus, one file per question**, stored as session resources keyed by question — `respostas/level1/<k>.webm`, `respostas/level2/<part_id>/<k>.webm`, `respostas/level3/<prop_id>/<k>.webm`. Kept as **provenance** and never written into the report — the cell is text only, and audio-only answers read `_(no answer)_` (§8.7, §10.4; ENG-356/ENG-327). |
| O6 | Consent flow | **Two moments:** collection consent in Oral Collector at recording time (travels with the audio); pipeline-use consent at session start in Colar de Sons. Both admit oral form (§12). |
| O7 | Trust copy | *"Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso."* (§5). |
| O10 | Artifact language & the AI-content rule *(2026-07-23, ENG-326)* | **Artifacts are always English**; PT/EN are working languages (§1.1). The no-AI-content rule admits **three carve-outs** — question voice, STT of answers, PT→EN translation — each on our own API, disclosed at setup, producing a draft a human confirms; an unconfirmed draft never enters an artifact (§4, §8.7, §12, §14). The contract normalization is ENG-356. |

### 15.2 Open items

- **O8 — Acousteme granularity mapping** *(owner: pipeline/API team)*. The derivation rule from an audio's acousteme data to the uniform bead duration for each level (small / medium / large), the acousteme payload shape as stored in the bucket, and the fixed fallback durations for uploaded audios without acoustemes (reference: v1's 0.25 s ≈ medium). **RESOLVED** (ENG-242 / tripod-api PR #100): `beadSec = granularity_frames[level] × hop_sec` off the audio's envelope, with the tokenizer's own fixed grid (hop 20 ms, presets 10/25/50 frames → 0.20/0.50/1.00 s) for audios without one. The remaining pipeline obligation is that the acousteme params be **uniform per project**, so every audio of a project resolves to the same `beadSec` (ENG-352); the SPA refuses a divergent audio rather than cutting it on a second grid.
- **O9 — API persistence & endpoints (`tripod-api`)** *(on the radar — to be scoped, not specified here)*. This effort extends `tripod-api` with the persistence and endpoints Colar de Sons needs. The **areas** that will require DB models + Pydantic DTOs + endpoints, to be designed later under the repo's conventions (thin routers, service-owned data access, Alembic migrations): **sessions** (full autosave state + lifecycle + editor lock), **audio references** (bucket audio + acousteme payload), **artifacts** (opaque storage per §10.5 + download), **consent records** (§12), **audit log** (§12). Contract is code-first OpenAPI (§5); concrete schemas are a follow-up design discussion, deliberately out of this PRD.

---

## 16. Related documents

- **PRD — UI/UX Redesign v2 (Shemá)** — the visual/interaction layer and its prototype deliverables.
- **PRD as-built v1** — annex: the prototype implementation documented at code level (useful for implementers porting the validated flow).
- **Oral Collector** — companion field app; source of project audios via the shared API.
- `_spec/scene-kind-palette.json` (Compilador pin 5314907) — source of the 27-kind ontology; regenerate via `ferramentas/gen-scene-kind-palette.py`.
- `docs/scripts/nivel-1-holistico.md`, `docs/scripts/nivel-2-partes.md` — the Mapeamento question method.
