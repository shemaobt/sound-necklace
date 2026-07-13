# Noridoc: imports

Path: @/ui/pages/imports

### Overview

- The pipeline-interoperability station (ENG-248, PRD v2 §8.9): the two "doors" that connect the Colar to the downstream pipeline ("o Compilador"), presented on one facilitator screen — load a project **ENTREGA** (delivery) or resume a saved **RETORNO** (return).
- ENTREGA loads proposed spans **unlocked** ("as cenas são propostas — confirme de ouvido"); RETORNO loads confirmed spans **locked**, with `NEEDS_REVIEW` flags re-applied and the cursor moved to phrases.
- A thin wiring-layer page: it does **only** file selection, error/notice display, and store replacement. All mapping lives in @/contracts/imports.ts — the page never re-implements the mapping.

### How it fits into the larger codebase

- **Self-registers** through `import.meta.glob('/ui/pages/*/index.tsx')` (see @/ui/app/registries.ts): the `default` export in `index.tsx` is mandatory, keyed by the directory name `imports`.
- **Not yet reachable in the running shell** — like @/ui/pages/export before it, `imports` is neither in the stepper flow (@/ui/app/stepper-model.ts) nor in `KEY_TO_MODE` (@/ui/app/App.tsx). Wiring the setup entry-door cards to navigate here is a follow-up and was out of scope. In-app with no session it renders a guidance line; its jsdom suite drives it with a seeded @/ui/state store.
- **Contract seam.** `DeliverySchema`/`ReturnSchema` validate the JSON at the boundary; `applyDelivery`/`applyReturn` (in @/contracts/imports.ts) are 1:1 ports of the reference handlers in `docs/reference/index.html`. They map a validated DTO onto the pure @/domain `SessionState`.
- **State bridge.** Reads the live session via `useSessionStore` and replaces it via `sessionStore.getState().apply(() => outcome.state)` — so import goes through the same `canEdit` gate + autosave as every other edit (see @/ui/state/docs.md). Per @/.dependency-cruiser.cjs, @/ui/pages may import @/contracts, @/domain, and @/ui/state.
- **Facilitator surface (§7.2).** Counts/numbers in the success notices are allowed here; the §9.2 listener-minimalism guard that applies to listener stations does not.

### Core Implementation

- **`Imports()`** (@/ui/pages/imports/index.tsx): subscribes to `session`; renders a PT-BR guidance line and stops if there is no session. Otherwise renders two `<label>`-wrapped native `<input type="file">` doors plus a notices region.
- **Each door's flow:** read file text → `JSON.parse` → `Schema.parse` (Zod) → call the mapper with the _current_ session from `sessionStore.getState().session` → on `{ok:true}` replace the live session via `apply`; on `{ok:false, reason:'no-grid'}` show the mapper's PT-BR precondition copy (`DELIVERY_NO_GRID_MSG`/`RETURN_NO_GRID_MSG`); on any JSON/schema throw, show `Não consegui ler a entrega/o retorno (…)` and leave the store untouched.
- **Notices** are a local `Notice[]` (tone `ok`/`warn`/`err`); errors get `role="alert"`, others `role="status"`. Each door replaces the notice list wholesale on its next run.
- **Verbatim reference copy:** the delivery/return success notices keep the reference wording (scene/phrase counts interpolated) and now live as dictionary values under the `imports` namespace (@/ui/i18n/pt.ts). Delivery additionally pushes the `MANIFEST_MISMATCH_MSG` warning when the mapper reports `manifestMismatch` **and still loads**. Return has no mismatch warning (mirrors the reference — return import never warns on manifest).
- **Mixed languages are expected here** (ENG-279). The page's own notices translate, but the three precondition/warning messages it displays are defined in @/contracts/imports.ts (`DELIVERY_NO_GRID_MSG`, `RETURN_NO_GRID_MSG`, `MANIFEST_MISMATCH_MSG`) and stay **PT-BR under an EN UI** — they belong to a frozen layer. Same for the raw `detail` of a JSON/schema throw, which is interpolated into the translated failure frame as-is.

### Things to Know

- **Precondition = segmented audio.** Both mappers require a session whose audio is already segmented (`totalBeads > 0`, grid present); otherwise they return `no-grid` and the page shows the precondition copy without touching the store.
- **Mismatch does not block.** A delivery whose `manifest_id` diverges from the audio still loads — the warning is advisory, matching the reference behavior.
- **Store replacement is guarded.** `apply` is a no-op when `canEdit()` is false (offline, review, or foreign lock — see @/ui/state/docs.md), so an import can silently not take effect under those gates.
- **No browser test.** No Necklace/geometry is rendered; the jsdom suite (`imports.test.tsx`) covers the station fully. `imports.css` styles the doors and notices.
- **Mapping subtleties live in the contract, not here.** ID fallbacks (`PT#`/`P#`), the delivery's truthiness `||` fallbacks, and the return's per-`prop_id` flag re-application and `partsConfirmed` toggling are all in @/contracts/imports.ts (a FROZEN layer) — this page must never duplicate them.

Created and maintained by Nori.
