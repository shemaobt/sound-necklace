# PRD — Colar de Sons (Arquivo Oral) · UI/UX Redesign — **v2**

**Audience of this document:** Claude Design (or any designer/engineer executing the redesign)
**Product:** Colar de Sons — client-side, single-file HTML web app for oral-language archiving (Shemá / Tripod pipeline)
**Current shipped build:** `index.html`, ~1,400 lines, zero dependencies, all audio processed in-browser, nothing uploaded
**PRD language:** English. **All UI copy remains in PT-BR** (Brazilian Portuguese). English strings in this doc are for spec purposes only.
**Primary device:** Notebook / desktop (mouse + keyboard; touch-friendly targets are welcome but not the driver)
**Revision:** v2 · July 2026 — folds the explored + prototyped redesign decisions back into the spec. See the changelog below.

---

## 0. What changed in v2 (changelog)

v1 was a forward-looking brief. v2 keeps every invariant and every field-validated behavior, and now **records the design decisions** taken during the exploration + prototyping pass so the document matches what was built.

- **Visual system resolved (§4).** The Shemá tokens are now mapped concretely: cream/olive background strategy, telha accent, Montserrat + Merriweather roles, the two segment-identity palettes (this closes **O4**), the full necklace-state vocabulary, the three-shape confidence intent, and the motion catalog.
- **Navigation resolved (§5).** The mode bar became a **"fio de contas"** (thread-of-beads) stepper below the header — six stations, progress-only.
- **"Ouça a história" resolved (§6.2).** The necklace itself became the transport — **tap a bead to hear from there; the glowing bead is the pause target**. Two treatments were compared, *Colar puro* vs *Fio-trilha*; **Colar puro (pure) is the chosen default.**
- **Triagem resolved (§6.4).** The 27-chip wall became a *"mais comuns"* card grid + a *"ver todos por tema"* disclosure (6 themes) + none-fit; confidence became a three-shape gesture; coverage moved into a facilitator-only drawer. An audio-first alternative was explored and parked.
- **Segmentação resolved (§6.5).** The border-crossing warning became a **visual seam modal** that shows the seam sliding on the cord.
- **Mapeamento resolved (§6.6).** Questionnaire → conversation: an animated **storyteller guide** speaks the question aloud, the listener **answers by voice** (mic + live waveform), typing is optional, a **thread** shows progress, and facilitator-led questions carry a wordless role marker.
- **Export resolved (§6.7).** Three explained document cards + a celebratory "fully strung necklace" completion state.
- **Open questions updated (§10).** O4 closed; O1 and O2 have a chosen direction pending pipeline sign-off; O3 still open.
- **Deliverables added (§11).** Pointers to the prototype and exploration boards produced in Claude Design.

Nothing in §7 (Invariants) changed. Where v1 said "redesign latitude," v2 adds a **"Decided"** note describing the direction that was taken; the "must keep" behavior is unchanged.

---

## 1. What this product is

Colar de Sons ("Necklace of Sounds") lets a facilitator and a native listener take a recorded oral story in an unwritten language and segment it *by ear* into a four-level hierarchy:

**Colar (the whole story) → Cenas (scenes) → Frases (phrases/propositions) → answers about meaning**

The audio is sliced into a fixed grid of tiny "contas" (beads, e.g. 0.25 s each). Every boundary the user sets snaps to a bead index. The output is a set of JSON documents consumed downstream by an automated pipeline ("o Compilador" / Claude Code agents). The app never transcribes and never sends audio anywhere — it is a listening and anchoring tool.

### The central metaphor (keep it)
The story is rendered as a **necklace of beads**: rows of pearls on a cord. Playback "lights up" beads as they play. Users click beads to mark where a scene or phrase starts and ends. Confirmed scene endings render as square beads on the cord. This metaphor is culturally legible, validated in the field, and is the soul of the product. The redesign elevates it: in the resolved design the necklace is not just the map — it is also the **transport** (you listen *through* the cord) and the **progress bar**.

---

## 2. Who uses it — and the single most important design constraint

Two people share one screen:

- **The facilitator** (e.g. "Marcia" role): literate, operates setup, export, and edge cases.
- **The listener/respondent** (e.g. "Jean" role): a speaker from an **oral culture**. May not read fluently — or at all. The listener is the one making the actual segmentation and meaning decisions *by ear*.

**Design constraint #1 — design for ears, not for eyes-on-text.** Every core decision the listener makes must be possible while reading little or nothing:

- Meaning must be carried by **audio feedback, color, shape, size, position, and motion** — text is a secondary channel for the facilitator.
- Numbers and counters are noise for this audience. The build hides bead counts, coverage counters, and readouts on purpose (see the CSS rule commented `minimalismo p/ cultura oral`). Preserve that intent. *(In the redesign, the one place counts appear is the facilitator-only coverage drawer — §6.4.)*
- One decision per screen. No dense panels, no competing calls to action.
- Anything that looks like a form, a test, or an exam creates anxiety and distorts answers. This is the explicit motivation for redesigning Phase 4 (see §6.6).
- Buttons the listener touches should be big, few, and stable in position across steps.

**Design constraint #2 — the exported data cannot change.** The visual layer is fully open; the data contract is frozen. See §7 (Invariants) — this section is the difference between a successful redesign and a broken pipeline.

---

## 3. Redesign mandate (what the client asked for)

1. **Modern, current, minimalist** visual language. The old build is functional but hand-rolled; it should feel like a contemporary, crafted product.
2. **Mostly a visual + microinteraction redesign.** The segmentation flow (Escuta → Cenas → Triagem → Segmentação) is field-validated. Keep its logic and sequence; make it *more pleasant* — better hierarchy, spacing, motion, feedback, delight.
3. **Phase 4 (Mapeamento) may be rethought more deeply**: transform the question-answering step from a typed questionnaire into a **conversation** — ideally with audio — so it stops feeling like an exam (§6.6).
4. **Nothing may change the exportable result.** Same JSON schemas, same IDs, same semantics, same gates.
5. Desktop-first layout. The app is used on a notebook, often with two people looking at the same screen.

**Status:** all five are addressed in the prototype (§11). The mandate itself is unchanged.

---

## 4. Visual system — **resolved**

All visual tokens come from the **Shemá Design System** selected as the project base. This section records how they were mapped. It remains true that the *old app's* visual system is a behavioral reference only, never a visual one.

### 4.1 Foundations taken from Shemá
- **Backgrounds — two-mode strategy.** Cream `#F6F5EB` (Shemá *branco*) is the quiet default for working screens (Setup, Cenas, Triagem, Segmentação, Report, Export). Deep olive `#3F3E20` (Shemá *preto*/*verde* register) is used **full-bleed for the two ceremonial / immersive moments only**: *Ouça a história* (§6.2) and *Mapeamento* (§6.6). Two backgrounds, no more.
- **Accent.** Telha `#BE4A01` is the single call-to-action / playback-trail color; hover/press darken to `#8F3701` (never lighten). Used confidently but sparingly.
- **Type.** **Montserrat** carries everything load-bearing — headlines, buttons, eyebrows, step labels, chips. **Merriweather italic** is the *quiet voice* — the invitational taglines ("Ouça a história.", "A história está inteira no colar."), the Mapeamento questions, and soft captions. Never title case; sentence case for headlines, ALL-CAPS Montserrat only for short eyebrows/labels.
- **Radii / cards / shadows / borders / hover / press / motion** follow the Shemá guidance verbatim — generous friendly radii, cream cards with low warm shadows, borders almost never (soft `verde @ ~16%` hairlines where needed), gentle ease-out ~220 ms, no bounces/springs.

### 4.2 Segment-identity palettes — **closes O4**
Two earthy palettes were derived so adjacent segments are always separable on the cord. Each entry is `{ base, lit, deep }` (base bead, lit/trail, pressed/edge).

- **Scene palette (8 hues)** — telha, olive-gold, teal, slate-blue, plum, olive, sage, rust:
  `#BE4A01 · #9A7B2E · #4E7A6A · #5E6B8C · #8C5A74 · #777D45 · #89AAA3 · #A85D3E`
- **Phrase palette (6 lighter tints)** — deliberately paler than the scene set so a phrase reads as "inside" its scene:
  `#D98A54 · #C4A96A · #86AC9C · #93A0BE · #B98FA8 · #A3A878`
- **Unplayed bead:** warm cream/oat pearl (`#E7E3D3` base, `#FBFAF3` highlight); on dark screens, a low-opacity cream.

### 4.3 Necklace-state vocabulary (the semantic map)
Each state has a distinct, text-free treatment:

- **Unplayed** — oat pearl.
- **Lit / playback trail** — telha (or the active segment's color), with a short pulsing trail of ~4 beads behind the head.
- **Head (now-playing)** — a larger, softly glowing pulsing bead; **tapping the glowing head pauses**.
- **Selection band** — a soft cord-band under the pending range; the two **edge beads** are emphasized.
- **Scene-end marker** — the confirmed end bead renders **square** on the cord (kept from the original).
- **Out-of-window (Segmentação)** — dimmed/asleep beads outside the active scene.
- **Active-scene band (Segmentação)** — a dashed band around the awake scene.
- **Fill treatment (variant, §6.2)** — *pure*: beads only. *track*: a thin telha rail behind the row fills left→playhead. **Default = pure.**

### 4.4 Intent colors
- **Confidence (core data) as three shapes, not text** — a **filled** olive disc = *Certeza* (alta, `#777D45`), a **half** gold disc = *Quase* (média, `#9A7B2E`), a **dashed ring** = *Na dúvida* (baixa). Shape carries the meaning; the label is secondary.
- **Success** olive/sage · **attention/warning** sand-gold `#F5E9D2`/`#755C20` · **error** telha-deep `#8F3701` on a soft telha wash. All from the Shemá earth range.
- **Brand mark:** the Shemá icon (inline SVG, five colorways available) sits in the header — *branco* on dark screens, *telha* on cream — and is watermarked at very low opacity into the ceremonial panels.

### 4.5 Motion catalog
Gentle, grounded, reduced-motion-safe (`@media (prefers-reduced-motion: reduce)` disables the decorative loops). Named loops in the prototype: bead pulse + head glow (playback), the storyteller guide's bob / blink / lip-sync (§6.6), and fade / pop for reveals. No parallax, no kinetic scaling.

Accessibility floor to keep or raise: visible `:focus-visible` (3px telha outline), `prefers-reduced-motion` respected, comfortable base text size for facilitator UI, and a header **sound toggle** so all UI sound can be muted.

---

## 5. Information architecture & navigation — **resolved**

### 5.1 Modes (top-level) and the stepper
Four modes, driven by `setMode()`: **Escuta** (two internal steps: "Ouça a história" and "Corte a história em cenas"), **Triagem**, **Segmentação**, **Mapeamento**.

**Decided — the "fio de contas" stepper.** The old tab strip is replaced by a **thread of beads** sitting in a slim band **below the header** (out of the content, keeping the stage calm). Six stations along one cord: **Ouvir · Cortar · Triagem · Frases · Conversa · Guardar**. The current station is a lit pearl with a soft halo; done stations are filled pearls; future stations are hollow. It behaves as a **progress indicator, not free navigation** — a station lights only once its mode is legitimately reached (`updateModeLocks()`): Triagem needs confirmed scenes; Segmentação needs ≥ 1 productive scene; Mapeamento needs ≥ 1 productive scene *and* ≥ 1 locked phrase. (Four *modes*, shown as six *stations* because Escuta has two steps and Export is the tail.)

- The **guided flow advances by itself** (unchanged): confirming the whole story reveals scene-cutting; confirming scenes → Triagem; finishing Triagem → Segmentação; finishing the last scene → Mapeamento. Users rarely touch the stepper.

### 5.2 The single traveling player → the necklace *is* the player
There is exactly **one player instance** that physically re-mounts into the active step's slot (`mountPlayer()` into `hostOuvir` / `hostCenas` / `hostFrases`), so the necklace + controls are always adjacent to the current decision. **Decided:** in the resolved direction the necklace itself is the transport — **tap any bead to play from there; the glowing head pauses** — so there is no floating, disembodied play bar. Saved items carry **no ▶ chip**: a bead inside a locked scene/phrase plays that whole item (ENG-291/ENG-293/ENG-296), so review lives on the cord too. The relocation between steps should be an animated, legible transition, not an instant jump.

### 5.3 Review mode
Loading a saved return (`retorno-ancoragem.json`) or toggling review shows a locked state: banner "🔒 Modo de revisão", segmentation frozen, play-only. Unlock button returns to editing. Keep.

---

## 6. Screen-by-screen spec

For each screen: **current behavior (must keep)**, and — where design work happened — **Decided** (the direction taken in the prototype). Latitude that has not yet been spent stays noted.

### 6.1 Setup — "Carregue o áudio"
**Keep:** audio file input (WAV recommended; decode failure shows a friendly PT-BR error suggesting WAV PCM); bead duration input (default 0.25 s, must be > 0); title/slug input; "Segmentar em contas" action; optional loading of a project delivery JSON (proposed spans to confirm by ear) and resuming a saved return JSON; warning when a loaded file's `manifest_id` doesn't match the audio; after segmentation the setup collapses out of the way. Privacy line ("Nada sai do seu navegador") is a trust anchor — keep it prominent.
**Decided:** facilitator-only screen, so denser text is acceptable. Layout is a two-column composition: a large **drag-and-drop audio zone** (dashed, with the Shemá icon and an "Áudio pronto" confirmation state) on the left; a cream settings card (story name + a **stepper control for bead duration**, − / value / +) and the **three entry doors as selectable radio cards** — *Começar do zero* / *Confirmar uma entrega* / *Retomar um retorno* — on the right. The privacy line is a pinned reassurance chip with a lock glyph. A "necklace being strung" moment on segmentation completion is still open latitude.

### 6.2 Escuta step 1 — "Ouça a história"
**Keep:** the full necklace renders (rows of beads; size presets exist in code but are hidden); the whole audio plays with beads lighting progressively (played beads take the telha trail); one confirmation action: **"Já ouvi a história completa"** — no partial confirmation, the whole span 0…N−1 must be covered.
**Decided — the emotional opening, and the transport model.** Full-bleed deep-olive background, the tagline **"Ouça a história."** set large in Merriweather italic, the brand icon watermarked faintly behind. **The necklace is the play bar:** the listener taps any bead to hear from there, beads light with a trailing glow as it plays, and **tapping the glowing head pauses**. A single large telha play button remains as the obvious "play from the start" affordance. The confirm button is the one decision and is made unmistakable. **Two treatments were compared** — `1a Colar puro` (beads only) vs `1b Fio-trilha` (a filling rail behind the beads); exposed as the `variant` prop (`pure` / `track`). **`pure` is the chosen default.**

### 6.3 Escuta step 2 — "Corte a história em cenas" (Camada 2)
**Keep — this interaction is validated, replicate it exactly:**
- Scenes are cut **sequentially from a locked frontier**: a new scene's start is pre-anchored at the seam (previous end + 1) via `primePart()`. The user only decides where the scene **ends**.
- Click a bead → sets/extends the selection; first click sets pending start (here pre-primed), second click sets end; further clicks nudge the nearest edge. Every click gives **instant audio feedback**: first click plays that bead; range set plays the range; edge nudge plays ~1 s around the moved boundary only (`playEdge`) — "the ear decides."
- Mouse **hover near a selection edge (~280 ms dwell)** plays that boundary without changing it (field-requested — "sugestão da Marcia"). Keep it.
- A selection band highlights the range; a big **"✓ Confirmar esta cena"** bar sits under the player. Confirming locks the scene, marks its end bead square, and immediately opens the next scene pre-anchored at the seam.
- Confirmed scenes list below: swatch color, "Cena N", ▶ ouvir, ✓ pronto, Reabrir. Reopening scene *i* unlocks *i* and everything after it (frontier integrity).
- "Confirmar as cenas →" requires ≥ 1 locked scene, discards any empty trailing scene, and auto-advances to Triagem. Errors are inline PT-BR messages (e.g., "A cena não pode começar antes da conta X").
**Decided:** cream stage; the instruction makes the one job unmistakable — *"Toque no colar onde **esta cena termina**. O começo já está costurado."* — with "esta cena termina" emphasized in telha; with ≥ 1 scene locked the second sentence becomes *"Toque numa cena pronta para reouvir."*, verbatim from the "Ouvir no colar" study (§11). Confirmed scenes render as compact pill **chips** (swatch · Cena N · Reabrir — inert body, no ▶: the beads play the scene) in a wrapping row; the dark **"Confirmar as cenas →"** button appears only once ≥ 1 scene is locked. The seam advancing to the next scene should animate.

### 6.4 Triagem — "Essa cena é sobre o quê?"
**Keep:**
- One scene in focus at a time, with a row of **progress dots (one per scene)** at the top doubling as jump targets; "▶ Ouvir esta cena"; current tag state (pending / tagged + confidence / "⌀ nenhum se encaixa").
- The picker offers the **27 scene kinds of the Ruth ontology** in two tiers — rare ("ALTA", target 1–2) and common (target 3) — with **PT-BR labels** (`SK_PT`) while the underlying values stay English (English shows on hover via `title`). A text filter exists (facilitator convenience). "⌀ Nenhum se encaixa" is always available and marks the scene `none_fit` — a *finding* (evidence toward a native scene type; decision belongs to "Marcia → SC"), not a dead end.
- Choosing a kind then requires a **confidence choice: alta / média / baixa**. Keep it as a first-class, friendly gesture, not a dropdown.
- **Hard gate:** "Já classifiquei todas as cenas →" enables only when every scene is triaged AND ≥ 1 scene is productive. If all scenes end up `none_fit`, Segmentação and Mapeamento stay locked and the app explains that this story yields no Ruth coverage — choose another story; the marks are saved as native-type evidence. Keep these messages' meaning exactly.
- A coverage table (firm vs hesitant counts per kind, targets, open rare kinds as "candidatos a ausência") exists but is **hidden** from the listener. Keep it available but out of the listener's face.
**Decided — the picker (the weakest UI in v1) was fully reworked:**
- Instead of a wall of 27 chips, the focused scene shows a **"Mais comuns"** two-column grid of large tappable cards (color dot + PT-BR label), then a **"Ver todos os tipos por tema"** disclosure that expands the full ontology **grouped into 6 themes** (Indo e vindo · Fala e acordo · Trabalho e terra · Sentimento · Rito e aliança · Narração), each theme color-coded. **"Nenhum se encaixa"** is a persistent dashed card at the bottom. All 27 kinds + none-fit remain reachable; stored English values are untouched.
- **Confidence became the three-shape gesture** from §4.4 — three big cards *Certeza / Quase / Na dúvida* whose **filled / half / dashed** disc says the meaning without reading.
- **Coverage moved into a facilitator-only drawer** ("Cobertura · só facilitadora") that slides in from the right on an olive panel — productive count, per-kind counts (mono), and "candidatos a ausência" — invisible to the listener until opened.
- **Parked alternative (`1k`):** an audio-first "Essa cena parece mais com…" flow that browses scene *families* by ear before narrowing. Not adopted; kept on the exploration board for later.

### 6.5 Segmentação — phrases inside a scene (Camada 3)
**Keep:**
- Work happens **one productive scene at a time** (`activeScene`). The necklace **windows down** to the active scene plus a small margin (~2 s each side); outside beads dim; a dashed band marks the scene. "▶ ouvir" plays the scene, not the whole story.
- Title reads "Cena N · <kind label>"; the primary button reads "Pronto com esta cena →" and, on the last scene, "Já segmentei todas as cenas →".
- Phrases are anchored like scenes (frontier logic), plus: the **first phrase of a scene may reach back into the previous neighbor** (start-of-scene test, PLANO §4.2).
- **Border-crossing flow (`offerBorderMove`) — keep the logic verbatim:** if a phrase selection crosses the scene border, the app *guides instead of blocking*:
  - Small overshoot (≤ max(3 beads, 25% of scene)) → offer "Mover a borda até aqui" (`slideSeam`: this scene grows, the immediate neighbor shrinks) or "Reancorar dentro da cena".
  - Large overshoot or swallowing the neighbor → warn it looks like a re-cut, route to Triagem ("Voltar à Triagem"); "Mover mesmo assim" only when the neighbor isn't fully consumed.
  - Neighbor productive **and already has phrases** → escalate: only route to Triagem or re-anchor.
- Locked phrases list with swatch, "Frase N", ▶ ouvir, ✓ pronto, Reabrir, **⚑ revisar** flag (exported as `NEEDS_REVIEW`), Remover.
- Leaving a scene with zero phrases triggers a soft warning; a second click proceeds anyway. Back navigation: previous scene, or Triagem from the first scene.
**Decided:** the windowed scene sits inside a **dashed "awake" band**; sleeping beads are visibly dimmed. Locked phrases are pill chips (swatch · Frase N · ⚑ revisar · ✕ remover — no ▶; like scenes, a locked phrase is heard by tapping its beads, §8.2). **The border-crossing warning became a visual modal (`1g`):** an olive overlay that renders the relevant stretch of cord and **shows the seam sliding** — "A frase passou da borda da cena." — with the small-overshoot choices (*Mover a borda até aqui* / *Ficar dentro da cena*) or the large-overshoot choices (*Voltar à Triagem* / *Reancorar dentro da cena*), plus one line explaining the consequence ("A cena de hoje cresce, a vizinha encolhe").

### 6.6 Mapeamento (Phase 4) — **the big redesign: from questionnaire to conversation**
**Current behavior:** three levels of scripted questions rendered one-per-screen (L1: 11 whole-story questions; L2: 5 per scene incl. none-fit; L3: 5 per phrase in productive scenes), each with a ▶ for the relevant audio span and a free-text textarea, then a consolidated **editable report**. Exports: `<slug>-relatorio-mapeamento.md` and the anchoring JSON. The report header states the contract: free-text raw material for Claude Code, `source_domain: oral_archive`, `speaker_role: LISTENER_NOT_STORYTELLER`, manifest id; the app never classifies vocabulary, never fills in absence, never generates the map itself.

**Problem:** it reads and feels like an exam.

**Decided — a guided conversation (`1h` / `2a`):**
- Full-bleed deep-olive stage. On the left, an **animated storyteller guide** — a warm human figure who **looks at you, breathes (bob), blinks, and lip-syncs** while the question is spoken. A **"Ouvir a pergunta"** button speaks the current question aloud (speech synthesis baseline — see O2). One question at a time, set large in Merriweather.
- On the right, the listener **answers by voice**: a big telha **mic button**, a **live waveform** while recording, and **"ouvir" / "de novo"** (playback + re-record) once an answer exists (MediaRecorder, still fully client-side). Typing is the *optional* channel ("a facilitadora pode escrever depois — nunca por você").
- Progress is a **thread of beads** along the bottom — one per question — so it feels like moving through a conversation, never a form with required fields. Prev / "Próxima pergunta" navigation.
- **Facilitator-led questions carry a wordless role marker** (a small facilitator/notebook glyph) — e.g. the significant-absence question ("nunca preencha por conta própria") — distinguishing "facilitator question" from "listener question" without relying on text.
- The scripted question **order and wording** (`L1_Q`, `L2_Q`, `L3_Q`, including facilitator-only notes) are preserved exactly — the *script* is method, the *skin* is free.
- **Parked alternative (`1l`):** a chat-thread "fio de conversa" treatment (question/answer bubbles). Not adopted; the guide+voice treatment won.

**Report — kept, restyled.** The consolidated, **editable** artifact remains and still exports as Markdown with the exact current structure and header contract. In the redesign each question is a cream card: the question in Merriweather, a **role marker** for facilitator questions, an **audio-answer row** (play + waveform + duration) where the answer is a recording, "ainda sem resposta gravada" where empty, and an optional **"acrescentar uma observação"** facilitator note. Where an answer exists only as audio, the report cell references the recording (see **O1**).

**Non-negotiable in this phase:** question keys and structure (`level1/level2/level3` keyed by question `k`, `part_id`, `prop_id`), the report's Markdown skeleton, and the principle that the app collects raw material only.

### 6.7 Export — "Salvar os Documentos" / "Guardar os documentos"
**Keep:** two JSON downloads — `<slug>-retorno-ancoragem.json` (requires the whole story confirmed; warns how many phrases lack a locked end) and `<slug>-manifesto-contas.json` — plus the Mapeamento report `.md`; success/error messages; the card collapses to a saved state once files are downloaded.
**Decided:** a calm cream completion screen headed **"A história está inteira no colar."** with the **full necklace shown strung** conta-a-conta. **Three document cards**, each explained in human language rather than by filename alone:
- `retorno-ancoragem.json` — **"As decisões de vocês"** (where each scene/phrase begins and ends, with kind + confidence).
- `manifesto-contas.json` — **"O mapa das contas"** (how the audio was sliced; the exact pair for this audio).
- `relatorio-mapeamento.md` — **"A conversa sobre o sentido"** (the editable report; voice answers referenced per question).
Each card shows a "Baixar" → "baixado" state; once all are saved, a celebratory chip: **"documentos salvos — nada saiu deste computador."**

---

## 7. Invariants — the frozen core (do not touch)

Any redesign, however deep, must leave these bit-identical:

1. **Bead grid math.** `beadSec` default 0.25 s; `buildBeads` slices duration into `floor(dur/beadSec)` beads plus a final partial bead; bead indices are the universal coordinate system. Changing bead size after anchoring shifts boundaries — hence the setup warning.
2. **`manifest_id`.** FNV-1a 32-bit hash over channel count, sample rate, sample count, strided quantized PCM samples, and bead duration in ms; serialized as `fnv1a32:xxxxxxxx`. Fingerprints the audio+grid pair across the pipeline.
3. **`manifesto-contas.json` schema:** `{ manifest_id, audio_filename, bead_duration_sec, total_beads, beads:[{index,startTime,endTime}] }`.
4. **`retorno-ancoragem.json` schema:** `{ manifest_id, story_slug, scenes:[{ scene_id:"S1", confirmed_span:{start_bead,end_bead}, parts:[{part_id, scene_id:"S"+n, scene_kind, scene_kind_confidence, tag_state, confirmed_span}], propositions:[{prop_id, part_link, confirmed_span}] }], flags:[{kind:"NEEDS_REVIEW", prop_id, note_pt}] }`. IDs: `PT1…` for parts, `P1…` for propositions, sequential `S#` scene numbering by order.
5. **`scene_kind` values stay in English** (e.g. `GLEANING_SCENE`) in state and exports — PT-BR is display-only (`SK_PT`). The 27-kind list and its ALTA/comum tiering are generated from `_spec/scene-kind-palette.json` (Compilador pin 5314907) and must not be hand-edited.
6. **Confidence vocabulary:** stored values `alta` / `média` / `baixa`; tag states `pending` / `tagged` / `none_fit`. *(The three-shape UI in §4.4/§6.4 is display only — it stores these exact values.)*
7. **Frontier + seam semantics:** sequential locking, reopen-unlocks-everything-after, first-phrase back-reach, seam sliding rules and thresholds (max(3, 25% of scene)), the two-productive-scenes escalation.
8. **Gates:** whole-story confirmation before scenes; ≥ 1 locked scene before Triagem; all-triaged + ≥ 1 productive before Segmentação; ≥ 1 productive + ≥ 1 phrase before Mapeamento; the all-none-fit lockout.
9. **Import behaviors:** delivery JSON loads *proposed* spans unlocked ("confirme de ouvido"); resume JSON loads *confirmed* spans locked; manifest-mismatch warning.
10. **Privacy model:** single self-contained HTML file, no network calls, audio never leaves the browser.
11. **Mapeamento question scripts and report structure** (see §6.6): question order/wording, `level1/2/3` keying, the report Markdown skeleton and header contract.

---

## 8. Design principles for the new visual language

1. **Ear-first.** Every interactive element the listener uses responds with sound before (or instead of) text. Budget for subtle UI sound design (bead click, seam lock, confirmation chime), gated by the header sound toggle and reduced-motion/sound preferences.
2. **One decision per moment.** The guided flow enforces this structurally; the visual layer enforces it optically — one dominant action, everything else quiet.
3. **The necklace is the hero.** It is the map, the progress bar, the transport, the selection tool, and the cultural anchor. Invest the signature effort there: pearl materiality, the lit trail, square end-beads, the dimmed window in Segmentação, the seam sliding.
4. **Text is for the facilitator.** Listener-facing labels stay short, concrete, warm PT-BR; density (coverage tables, IDs, mono hashes) lives in facilitator-only surfaces (the coverage drawer).
5. **Modern minimalism with warmth.** Express the Shemá system fully — contemporary spacing, type, motion — while keeping the product human for a shared-screen, two-person session; not skeuomorphic, not clinical.
6. **Never punish.** Errors guide ("Toque no colar onde a cena termina."), warnings allow proceeding on a second confirmation, border-crossing offers choices. Preserve this voice.

---

## 9. Out of scope

- Any server, account, sync, or telemetry.
- Transcription, translation, or AI-generated **content** inside the app — nothing about the story or the listener's answers is invented, transcribed, or translated by a model. The synthetic question voice (O2) is not an exception: it reads human-authored frozen strings, and its use is disclosed (PRD v2 §4, §12).
- Changing the Ruth ontology, targets, or confidence model.
- Mobile-first layout (desktop is primary; graceful degradation is enough).

---

## 10. Open questions — **updated**

- **O1 — Audio answers in the report.** *Direction chosen, pending pipeline sign-off.* The report references each voice answer by question key; the working assumption is to export a zip with `respostas/<question-key>.webm` linked from the `.md`, keeping the Markdown structure valid when answers are typed instead. **Confirm the file/link convention with the pipeline owner before the audio-answer build.**
- **O2 — Spoken question prompts.** ***Closed (2026-07-13): an ElevenLabs voice, served by the platform's shared TTS service.*** The original rationale for speech synthesis — "adds no asset weight to the single-file build" — died with the premise behind it (O3): the shipped v2 is a multi-file SPA, and the voice is neither bundled nor shipped. It is synthesized and cached **by our own API** and fetched per question, so the app never contacts the provider (PRD v2 §12). **One native voice per UI language** (pt-BR and en-US), so the spoken language never diverges from the displayed one — a single multilingual voice was rejected because it carries its accent across languages. The browser's speech synthesis survives **only as a fallback** when the API is unreachable. Pre-recorded *human* prompts are no longer the planned upgrade: the synthetic voice is the decision, not a step toward one (plano-de-acao §4). AI-use disclosure is mandatory — PRD v2 §12.
- **O3 — Single-file constraint.** ***Closed by the build (2026-07-13): it does not apply to the v2 app.*** The shipped v2 is a **multi-file Vite SPA** — fonts arrive as npm packages (`@fontsource/…`), not embedded — so the constraint described a property of the v1 prototype that the implementation never inherited. It no longer bears on anything: no audio asset is bundled at all (O2's voice comes from the API).
- **O4 — Scene/phrase swatch palettes.** *Closed.* The two palettes are defined in §4.2 (8 scene hues, 6 phrase tints), derived from the Shemá earth range for adjacent-segment contrast on the cord.

---

## 11. Design deliverables (Claude Design)

The redesign was explored and prototyped as Design Components in this project:

- **`Colar de Sons - Protótipo.dc.html`** — the full guided flow, end to end (Setup → Ouvir → Cenas → Triagem → Segmentação → Mapeamento → Report → Export), implementing every "Decided" note above. The reference build for handoff.
- **`Colar de Sons - Exploração.dc.html`** — the exploration board: labeled options **1a–1l** (setup, ceremonial escuta, scene-cut, triagem + confidence, segmentação window, seam slide, mapeamento conversation, export, the token→state semantic map, and the parked audio-first / chat-thread alternatives) plus **2a** (the storyteller guide study).
- **`Colar de Sons - Ouvir no colar.dc.html`** + **`… (comparar).dc.html`** — the "necklace-is-the-transport" study; `pure` vs `track` compared, **`pure` chosen**.
- **`Colar de Sons - Classificação (opções).dc.html`** — Triagem picker options.
- **`Colar de Sons - Wizard (explorações).dc.html`** — the four stepper treatments that led to the "fio de contas" decision (§5.1).
- **`Colar de Sons - Telas.dc.html`** — assembled screens.

All are visual/behavioral prototypes in the Shemá system; they intentionally do **not** re-implement the frozen pipeline internals (§7) — those carry over from the shipped `index.html`.
