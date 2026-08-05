# docs/design — Claude Design prototypes (normative visual reference)

Imported 2026-07-09 from the Claude Design project **"Colar de Sons redesign"**
(claude.ai/design/p/2b0236b1-fb71-452b-b49c-425b116e5c68). `Protótipo.dc.html`
refreshed 2026-07-12 (ENG-278): the team added full **Login** and **Dashboard**
screens to the end-to-end flow and restyled **Setup** (centered single column).
These are the
prototypes listed in `docs/PRD-redesign.md` §11 — **the normative reference for
look, layout and motion** (CLAUDE.md precedence rule 2). Behavior and data
contracts still come from PRD v2 + `docs/reference/index.html`.

| File | What it is |
|---|---|
| `Colar de Sons - Protótipo.dc.html` | The full guided flow end to end — the reference build for handoff |
| `Colar de Sons - Ouvir no colar.dc.html` | Necklace-as-transport study (`variant` prop: `pure`/`track` — **`pure` is the chosen default**) |
| `Colar de Sons - Ouvir no colar (comparar).dc.html` | Side-by-side board comparing 1a `pure` vs 1b `track` |
| `Colar de Sons - Classificação (opções).dc.html` | Triagem picker options 1a/1b/1c — incl. the theme→kind mapping used by ENG-225 |
| `Colar de Sons - Wizard (explorações).dc.html` | The four stepper treatments that led to the "fio de contas" decision |
| `Colar de Sons - Exploração.dc.html` | Exploration board (options 1a–1l + 2a storyteller guide study) |
| `Colar de Sons - Telas.dc.html` | Assembled-screens panorama (labels p1…p12; images live in the design project) |
| `support.js` | The `.dc.html` runtime (generated; do not edit) |
| `assets/` | Shemá brand SVGs: icon (branco/telha/verde) + pattern tile |
| `trava-granularidade.html` | The granularity-lock dialog (ENG-363) |
| `pacote-melhorias-ui.html` | **August 2026 delivery** — copy-ready CSS/JS plus a marked-up template per item, from the first walkthrough of the built app (ENG-386…ENG-393) |
| `pacote-melhorias-ui.md` | The integration guide for the above: exact PT-BR copy, accessibility notes, QA checklist |

## Viewing

The prototypes are self-contained HTML + `support.js` (React from `window` —
provided by the dc runtime). Open via a local static server from THIS directory
so relative paths resolve: `npx serve docs/design` → open the `.dc.html` file.
Screenshots referenced by `Telas.dc.html` and the font files are NOT imported
(they exceed the 256 KiB transfer cap): view them in the design project itself.

## Fonts

The official TTFs (Montserrat ×5 weights, Merriweather ×4) live in the design
project under `assets/fonts/` but could not be imported (transfer cap).
**ENG-213 self-hosts the same families from Google Fonts** — identical upstream
sources; weights used by the prototypes: Montserrat 400/500/600/700/900,
Merriweather 300/400/400-italic/700.

## Reading the prototypes as spec

- Templates use the dc DSL (`<x-dc>`, `sc-for`, `sc-if`, `{{ props }}`) with a
  `<script data-dc-script>` component class at the bottom — read the class for
  interaction logic and exact style tokens.
- These files are REFERENCE material: never imported by app code, never linted,
  never reformatted (docs/ is in `.prettierignore`).
- Where a prototype disagrees with PRD v2 on behavior/data, **PRD v2 wins**
  (e.g. the Setup screen here still shows a numeric bead-duration stepper and a
  drag-and-drop file zone — superseded by granularity levels + bucket-only,
  PRD v2 §8.1/§7.4; see ENG-243).
- **A newer delivery supersedes an older one for the screen it covers.**
  `pacote-melhorias-ui.html` was written against the built app and wins over
  `Protótipo.dc.html` where they disagree — most visibly on Setup, whose
  centered single column it replaces with two columns so the create button
  cannot be pushed below the fold.
- **A delivery can also be stale about behaviour, and then the code wins.** Four
  of this one's instructions did not survive contact with the app and were
  deliberately not followed (ENG-386…ENG-393): its `CdsFollow` assumes per-row
  DOM the necklace does not have; its footer capsule restores play/flag/reopen
  that ENG-291 and ENG-342 removed on purpose; its Setup disables the Continue
  button where this app validates on click and explains (§9.5 "guide, never
  punish"); and its `--cds-*` names collide with the existing token vocabulary,
  so its dark palette was mapped onto a new `--cds-ui-*` role layer instead.
  Read a delivery for the LOOK; check the decision log before taking its
  interactions at face value.
