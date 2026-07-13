# docs/design — Claude Design prototypes (normative visual reference)

Imported 2026-07-09 from the Claude Design project **"Colar de Sons redesign"**
(claude.ai/design/p/2b0236b1-fb71-452b-b49c-425b116e5c68). `Protótipo.dc.html`
refreshed 2026-07-13 (ENG-278): the team added full **Login** and **Dashboard**
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
