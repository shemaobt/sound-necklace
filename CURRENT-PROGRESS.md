# CURRENT-PROGRESS — Colar de Sons

**Authoritative progress lives in Linear** (project Sound Necklace, milestone MVP —
issue states + the blockedBy graph decide what is next; see APPLICATION-SPEC.md).
This file is an **append-only iteration log** for fast warm-up: skim it, then go to
Linear. One line per loop iteration, newest last:

`YYYY-MM-DD HH:MM · ENG-### · result (merged | in-review | blocked: reason) · PR #`

## Log

- 2026-07-09 · (pre-loop) · Planning session complete: 47 issues ENG-212…ENG-258 created; repo skeleton + CI gates + docs/architecture.md delivered · PR #1 (skeleton, awaiting human merge)
- 2026-07-09 03:55 · ENG-214 · in-review (contract-critical: domain grid/hash/ids + golden cases 1 e 3 byte-idênticos; aguarda revisão humana) · PR #6
- 2026-07-09 09:15 · ENG-216 · in-review (contract-critical: domain state/frontier/selection/scenes + replay dos passos de cena do golden case 2; coverage domain 100%; aguarda revisão humana) · PR #10
- 2026-07-09 10:20 · ENG-215 · merged (ui/atoms: 7 átomos Shemá, 45 testes dom, guarda reduced-motion + minimalismo §9.2) · PR #11
- 2026-07-09 10:55 · ENG-217 · merged (adapters/audio: porta AudioEngine + núcleo de playback 1:1 da referência com transport injetado; fixture LCG headless; Web Audio real com smoke skipIf; 31 testes) · PR #12
- 2026-07-09 15:45 · ENG-218 · merged (ui/molecules: 10 moléculas Shemá — bead-row, selection-band, scene/phrase chip, confidence-trio radiogroup+roving, kind-card, question/document cards, stepper-station, progress-dots, trust-chip; 45 testes dom + guarda minimalismo §9.2; a11y APG/WCAG) · PR #14
- 2026-07-09 16:20 · ENG-220 · merged (ui/organisms: o colar — geometria pura portada 1:1 da referência (janela/beadAtXY/drawBand), modelo de clique delegado com 1 listener nativo, hover-edge dwell 280ms, head-tap, windowing por cena com dim+banda tracejada, banda de seleção com bordas, iluminação de playback IMPERATIVA via data-play sem re-render; 30 testes incl. 9 de interação em Chromium real + guarda §9.2 + guarda reduced-motion) · PR #15
- 2026-07-09 16:50 · ENG-219 · in-review (contract-critical: domain triagem — scene-kinds (27 = 19 ALTA + 8 comum, SK_PT, skShort, T_TARGET), triagem (tagScene/markNoneFit + selectors lockedParts/productiveScenes), coverage (firme/hesitante, candidato a ausência, trava all-none-fit), gates (triagemDone + copy §8.5 verbatim, modeLocks, resolveMode redirect só-produtiva, setMode + efeito partsConfirmed); replay de triagem do golden case 2 (pending avança p/ phraseSelect/ENG-223); domain 100% linhas/100% funcs/96.75% branch; aguarda revisão humana) · PR #TBD
- 2026-07-09 18:05 · ENG-221 · merged (ui/organisms: palco da conversa + guia contador — conversation-stage reusa QuestionCard/BeadRow/WaveformBar/Button, gravador dirigido por props (idle→recording→recorded) com callbacks, fio de progresso sem dígitos §9.2, canal digitado opcional; storyteller-guide com mecanismo de variante por import.meta.glob (prefere animated, traz só static SVG humano), reduced-motion gated; 12 testes dom + 2 de interação em Chromium real) · PR #17
- 2026-07-09 18:50 · ENG-224 · merged (ui/app shell — roteador History-API (useSyncExternalStore, sem react-router), 3 registries add-a-file por import.meta.glob (estações/adapters/addons) + station-host fallback "em construção", fio de contas derivado de modeLocks (clique delegado só em alcançável, §9.2), player itinerante único (portal p/ nó persistente movido por appendChild, stop() na troca), chrome de review/lock (§8.10/§7.3), connection gate online-only (adapters/connectivity fixture + organismo) + ui/state bridge Zustand (apply guardado por canEdit=online&&!review&&!lock, autosave injetável, som mudo); 42 testes dom/unit) · PR #18
