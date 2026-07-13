# Noridoc: relatorio

Path: @/ui/pages/relatorio

### Overview

- The report station (ENG-250): the consolidated, **editable** mapping report (PRD v2 §8.7 "The report", redesign §6.6). One cream card per question, in the exact order the domain produces (`questionSequence`), plus the two download actions (`.md` report and the `.json` anchoring shortcut).
- A wiring component: it reads the pure @/domain session through the @/ui/state session store, renders an editable card per question, dispatches text writes through the domain answer store, plays voice answers through the injected `VoiceRecorder` port, and exports the `.md` via the frozen @/contracts builder.
- Facilitator surface (§7.2): unlike the listener screens, digits/IDs are allowed here — the report lists scenes and phrases with numbers, kinds and section headers.

### How it fits into the larger codebase

- **The station after the conversation.** It self-registers through the `import.meta.glob('/ui/pages/*/index.tsx')` registry, and is ALSO resolved directly by @/ui/pages/mapeamento (a static `import.meta.glob('/ui/pages/relatorio/index.tsx')`) so the "próxima" at the last conversation question opens the report. Both consume the default export.
- **Question order is the domain's.** The flat card order comes verbatim from `questionSequence` (@/domain/mapping.ts): L1 `L1_Q` → per `lockedParts` (none_fit included) `L2_Q` → per `productiveFrases` `L3_Q`. The UI only inserts section (level) and scene/phrase group headers as it walks the sequence; those headers and the card's question text follow the UI language (`questionTextFor`, @/ui/i18n/mapeamento-questions.ts), while the question's `field` hint still renders the raw domain value.
- **The screen translates, the `.md` does not** (ENG-279). `buildMapReport` reads the PT-BR scripts straight from @/domain — @/contracts cannot import `ui/` at all (a dependency-cruiser rule) — so the downloaded report is byte-identical regardless of the UI language, and the golden harness keeps that output pinned.
- **Answers.** Text edits write through `setAnswer` (@/domain/mapping.ts) — the lazy answer store created/extended by `ensureMapping`; the store never loses answers. Voice answers are detected through the injected `VoiceRecorder.has(path)` (@/adapters/voice), keyed by the canonical `respostas/level{1,2,3}/…/<k>.webm` path from `voiceAnswerPath` (§10.4/O5); the play affordance calls `recorder.play(path)`.
- **Export.** The `.md` bytes come from `buildMapReport` (@/contracts/relatorio.ts) — byte-identical to the frozen skeleton (§10.4); the `.json` shortcut serializes `buildRetorno` (@/contracts) via `serializeArtifact`. Filenames from `relatorioFilename` / `retornoFilename`. The real download is the injectable `saveBytes` system boundary (default: a Blob/anchor).
- Reads session via `useSessionStore`, writes only through `sessionStore.apply` (see @/ui/state/docs.md), so the store's editability gates (online/review/lock) can silently pause a write. Per @/.dependency-cruiser.cjs, @/ui/pages may import @/domain, @/contracts, @/ui/state, @/ui/atoms and adapters.

### Core Implementation

- **`Relatorio({ recorder, saveBytes })`** (@/ui/pages/relatorio/index.tsx): subscribes `session`; renders `null` until a session with a non-empty question sequence exists. A `useMemo` derives `mapped` = `session` if it already has a mapping, else `ensureMapping(session)`, so answers render before the mount effect persists the store (which calls `sessionStore.apply(ensureMapping)` once when `session.mapping` is null).
- **Voice discovery.** One effect probes `recorder.has(path)` for every question path and, for the ones that have a recording, also reads `recorder.duration(path)`; it stores both the set of voiced paths and a `path → seconds` map. The set both (a) drives the voice-only row and (b) feeds `buildMapReport`'s `voice` argument so the `.md` references the recording; the map fills the row's real duration (formatted `m:ss`). With no recorder the set stays empty (no synchronous setState in the effect — `react-hooks/set-state-in-effect`).
- **`ReportCard`** renders one question. A typed answer shows an editable `textarea`; a voice-only answer (recording present, no typed text) shows the voice row (▶ play + decorative waveform + duration slot); an empty answer shows the `textarea` with the "ainda sem resposta gravada" placeholder. `ausencia` questions carry the wordless role marker.
- **Facilitator note.** The optional "acrescentar uma observação" note is stored in the answer store under a **reserved key** `nota__<k>` in the same bucket as the answer (`setAnswer` with the note slot). Because the mapping buckets are free `record<string,string>`, the note round-trips through the autosave DTO (@/contracts/session-state.ts), but `buildMapReport` only ever emits the question keys (`L1_Q`/`L2_Q`/`L3_Q`) — so the note NEVER appears in the exported `.md` (§10.4: the frozen skeleton has no note lines).
- **Downloads.** "Baixar relatório (.md)" → `saveBytes(relatorioFilename(slug), buildMapReport(mapped, voiceSet))`. "Baixar a ancoragem (.json)" is disabled and guarded by `whole.confirmed` (reference `renderMapReport` L1150) → `saveBytes(retornoFilename(slug), serializeArtifact(buildRetorno(mapped)))`.

### Things to Know

- **Voice duration is real** (ENG-271). The voice row's duration slot (`aria-label="duração da resposta"`) shows the saved recording's length formatted `m:ss`, read from `VoiceRecorder.duration(path)` (@/adapters/voice/types.ts). It falls back to `—` only before the durations resolve or when no recorder is wired.
- **Not yet reachable with audio.** `recorder`/`saveBytes` default so the station renders and exports standalone; @/ui/pages/mapeamento currently mounts it with no props (recorder dormant). Binding the recorder to the active session's SessionStore resources is the same follow-up noted for the conversation station (@/adapters/voice/register.ts).
- **No browser test.** This station has no `Necklace`/canvas geometry, so all tests run in jsdom (`relatorio.test.tsx`): rendering per answer type + role marker, text edits reaching the domain answer store, the facilitator note persisting (re-mount) while staying out of the `.md` (byte-assert against the real builder), and the two export actions incl. the `whole.confirmed` gate.

Created and maintained by Nori.
