# Noridoc: report

Path: @/ui/pages/report

### Overview

- The report station (ENG-250): the consolidated, **editable** mapping report (PRD v2 §8.7 "The report", redesign §6.6). One cream card per question, in the exact order the domain produces (`questionSequence`), each numbered `Q<n>` by its position in the conversation. **Downloading is the NEXT screen's job** — the footer's single action is "Guardar os documentos →".
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders an editable card per question, dispatches text writes through the domain answer store, and plays voice answers through the injected `VoiceRecorder` port.
- Facilitator surface (§7.2): unlike the listener screens, digits/IDs are allowed here — the report lists scenes and phrases with numbers, kinds and section headers.

### How it fits into the larger codebase

- **The station after the conversation.** It self-registers through the `import.meta.glob('/ui/pages/*/index.tsx')` registry, and is ALSO resolved directly by @/ui/pages/conversation (a static `import.meta.glob('/ui/pages/report/index.tsx')`) so the "próxima" at the last conversation question opens the report. Both consume the default export.
- **Question order is the domain's.** The flat card order comes verbatim from `questionSequence` (@/domain/mapping.ts): L1 `L1_Q` → per `lockedParts` (none_fit included) `L2_Q` → per `productiveFrases` `L3_Q`. The UI only inserts section (level) and scene/phrase group headers as it walks the sequence; those headers and the card's question text follow the UI language (`questionTextFor`, @/ui/i18n/conversation-questions.ts), while the question's `field` hint still renders the raw domain value.
- **The screen translates, the `.md` does not** (ENG-279). The card text comes from `questionTextFor`, but `buildMapReport` (@/ui/pages/export) reads the PT-BR scripts straight from @/domain — @/contracts cannot import `ui/` at all (a dependency-cruiser rule) — so the exported report is byte-identical regardless of the UI language, and the golden harness keeps that output pinned.
- **Answers.** Text edits write through `setAnswer` (@/domain/mapping.ts) — the lazy answer store created/extended by `ensureMapping`; the store never loses answers. Voice answers are detected through the injected `VoiceRecorder.has(path)` (@/adapters/voice), keyed by the canonical `respostas/level{1,2,3}/…/<k>.webm` path from `voiceAnswerPath` (§10.4/O5); the play affordance calls `recorder.play(path)`.
- Reads session via `useSessionStore`, writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause a write. Per @/.dependency-cruiser.cjs, @/ui/pages may import @/domain, @/contracts, @/ui/state, @/ui/atoms and adapters.

### Core Implementation

- **Header + white cards** (realigned to the Protótipo): a new `<header>` (eyebrow + serif italic headline, `report.eyebrow`/`report.headline`) sits above the question list; each `ReportCard` is now a white card (`--cds-radius-card-sm`, `--cds-shadow-card`) instead of the previous cream-tinted bordered card. Purely visual — the card content/order is unchanged.
- **`Report({ recorder })`** (@/ui/pages/report/index.tsx): subscribes `session`; renders `null` until a session with a non-empty question sequence exists. A `useMemo` derives `mapped` = `session` if it already has a mapping, else `ensureMapping(session)`, so answers render before the mount effect persists the store (which calls `sessionStore.apply(ensureMapping)` once when `session.mapping` is null).
- **Voice discovery.** One effect probes `recorder.has(path)` for every question path and, for the ones that have a recording, also reads `recorder.duration(path)`; it stores both the set of voiced paths and a `path → seconds` map. The set both (a) drives the voice-only row and (b) feeds `buildMapReport`'s `voice` argument so the `.md` references the recording; the map fills the row's real duration (formatted `m:ss`). With no recorder the set stays empty (no synchronous setState in the effect — `react-hooks/set-state-in-effect`).
- **`ReportCard`** renders one question. A typed answer shows an editable `textarea`; a voice-only answer (recording present, no typed text) shows the voice row (▶ play + decorative waveform + duration slot); an empty answer shows the `textarea` with the "ainda sem resposta gravada" placeholder. `ausencia` questions carry the wordless role marker.
- **The card is quiet by design** (prototype parity). The typed answer is a borderless, one-line field that grows with its text (`field-sizing: content` over `rows={1}`): empty, its italic placeholder reads as the prototype's "ainda sem resposta gravada" line, so a facilitator who will not write sees prose, not a form — 41 fixed 64px boxes read as a questionnaire. The note invite is a `+` text link, not a pill.
- **Facilitator note.** The optional "acrescentar uma observação" note is stored in the answer store under a **reserved key** `nota__<k>` in the same bucket as the answer (`setAnswer` with the note slot). Because the mapping buckets are free `record<string,string>`, the note round-trips through the autosave DTO (@/contracts/session-state.ts), but `buildMapReport` only ever emits the question keys (`L1_Q`/`L2_Q`/`L3_Q`) — so the note NEVER appears in the exported `.md` (§10.4: the frozen skeleton has no note lines).

### Things to Know

- **Voice duration is real** (ENG-271). The voice row's duration slot (`aria-label="duração da resposta"`) shows the saved recording's length formatted `m:ss`, read from `VoiceRecorder.duration(path)` (@/adapters/voice/types.ts). It falls back to `—` only before the durations resolve or when no recorder is wired.
- **The recorder arrives from the conversation.** @/ui/pages/conversation mounts this station with its own `recorder`; without it every card falls back to "ainda sem resposta gravada" and — since the interview is voice-only — no answer would be audible here at all. Binding that recorder to the active session's SessionStore resources is the follow-up noted in @/adapters/voice/register.ts.
- **No browser test.** This station has no `Necklace`/canvas geometry, so all tests run in jsdom (`report.test.tsx`): rendering per answer type + role marker, text edits reaching the domain answer store, the facilitator note persisting (re-mount) while staying out of the `.md` (byte-assert against the real builder), and the two export actions incl. the `whole.confirmed` gate.

Created and maintained by Nori.
