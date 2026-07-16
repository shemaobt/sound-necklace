# Noridoc: export

Path: @/ui/pages/export

### Overview

- The Export/Completion station (ENG-246): "Guardar os documentos" (PRD v2 §8.8, redesign §6.7) — the completion screen headed "A história está inteira no colar." with the whole necklace shown strung read-only, three explained document cards, and session completion.
- Completion produces the **three artifacts once** via the @/contracts builders and hands them **opaque** to the @/adapters/sessions `SessionStore`; downloads reuse the same in-memory bytes, so what the dashboard serves later is byte-identical (PRD v2 §10.5).
- A wiring-layer page: it reads the pure @/domain `session` from the @/ui/state store and receives the `SessionStore` adapter + session id **by prop** — the shell (@/ui/app/App.tsx) injects the app-global `appSessionStore()` and the `/session/:id` route id when the Export bead is current (ENG-270/272).

### How it fits into the larger codebase

- **Terminal station after @/ui/pages/mapeamento.** Stations self-register through `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts), so the default export in `index.tsx` is mandatory — the registry value keyed by the directory name `export`.
- **Reachable in the running app** (ENG-270/272). The shell makes the Guardar bead reachable when `modeLocks().mapeamento` holds and passes `store`/`sessionId` when it is current (@/ui/app/docs.md). The store is the app-global `appSessionStore()` shared with Setup/Dashboard, so a session created in Setup is readable here. The jsdom tests inject a `FixtureSessionStore` directly.
- **Wiring layer.** Per @/.dependency-cruiser.cjs, @/ui/pages may import adapters, @/domain, @/ui/state and the ui component layers. It reads state via `useSessionStore` and reopen clears review via `sessionStore.getState().setReview(false)` (see @/ui/state/docs.md).
- The `ArtifactCards` organism is imported by **direct path** (`../../organisms/artifact-cards/artifact-cards`), not the frozen @/ui/organisms/index.ts barrel — the same sibling-direct-import pattern @/ui/pages/triagem uses. The `Necklace` comes from the barrel.
- Consumes the @/contracts builders (`buildManifesto`/`buildRetorno`/`buildMapReport`, `serializeArtifact`, `toSessionDto`) and the export-gate predicates (`retornoExportStatus`, `canExportManifesto`) — the contract seam between the domain session and the downstream pipeline ("o Compilador").

### Core Implementation

- **`Export({ store, sessionId, saveBytes })`** (@/ui/pages/export/index.tsx): subscribes `session`; renders `null` until a session exists. Local state holds `phase`, `custody` (non-domain meta + voice set), `downloaded` (per-artifact flags), and a transient `notice`.
- **The artifact triple** is built once in a `useMemo` keyed on `session`+`custody`: `serializeArtifact(buildManifesto(session))`, `serializeArtifact(buildRetorno(session))`, `buildMapReport(session, voice)`. Per §10.5 the bytes from the builders **are** the artifact — downloads and `store.complete(...)` both hand out this same in-memory triple.
- **Phase state machine** `loading | edit | saved`: on mount (only when `store`+`sessionId` are present) it reads `store.get(id).status` and `store.load(id)` **inside one try/catch**, so a session the store cannot find — or a never-saved DTO — falls back to `DEFAULT_META`/`edit` rather than stranding in `loading` (the guard covers the `get`, not only the `load`). `load` recovers the meta (granularity/bucket/voice/consent) from the persisted DTO because the @/ui/state store holds only the domain state, not the meta; `toSessionDto` needs it. `completed → saved` (review), else `edit`.
- **Actions:** `saved` shows a ghost "Destravar para editar" → `store.reopen` (resets to `edit`, clears download flags); `edit` shows the dark "Concluir e guardar os documentos", disabled unless `canExport`, → `store.complete(id, toSessionDto(session, meta), triple)` then `saved`.
- **Gates mirror the reference** (docs/reference/index.html): the retorno download requires `retornoExportStatus(session).canExport` (whole confirmed) else it shows the blocked-export notice (same PT wording, now a dictionary value — @/ui/i18n) and does not download; the manifesto download silently no-ops unless `canExportManifesto(session)` (totalBeads > 0). The station's copy follows the UI language, but the **bytes and the filenames it hands out never do** (§10.5).

### Things to Know

- **Two filename sets.** `saveBytes` uses the slug-prefixed @/contracts helpers `retornoFilename`/`manifestoFilename`/`relatorioFilename(slug)` (e.g. `historia-retorno-ancoragem.json`), distinct from the **unprefixed** display filenames shown inside the `ArtifactCards` organism (`retorno-ancoragem.json`).
- **The download is the system-boundary seam.** `saveBytes(filename, bytes)` defaults to a Blob + object URL + anchor click (`domSaveBytes`); tests inject a spy to assert byte-identity against `store.getArtifacts(id)`.
- **The semFim advisory** renders only in `edit` when `retornoExportStatus(session).semFim > 0`: the literal "N frase(s) ainda sem fim travado." (the "(s)" is literal, the count exact). It is advisory — it does not block completion.
- **Facilitator surface.** Unlike listener screens, this is §7.2/§8.8 facilitator-facing, so the counts/numbers in the advisory and the document cards are allowed.
- **No browser test.** The `Necklace` is shown read-only (`transportOnly`) and its geometry is browser-tested in its own organism; the jsdom suite (`export.test.tsx`) covers this station fully. The cream stage (@/ui/pages/export/export.css) has no decorative motion — the only celebration is the organism's chip under its own reduced-motion guard. The necklace uses the @/ui/organisms/necklace `SIZE_EXPORT` preset (22px beads, the smallest of the three presets — this is a read-only recap, not a working surface) and the headline is now a light italic serif (`--cds-font-quiet-voice`), matching the Protótipo's completion screen.
- **Known follow-ups:** the `ArtifactCards` organism chip still carries the v1 local-custody wording ("documentos salvos — nada saiu deste computador") whereas PRD v2 §5 is cloud custody — changing the organism was out of this issue's scope.

Created and maintained by Nori.
