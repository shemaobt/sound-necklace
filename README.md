# Colar de Sons — Sound Necklace

An ear-first web app where a facilitator and a listener from an oral culture segment a
recorded oral story — a necklace of audio beads — into scenes and phrases and classify
the scenes against the Ruth ontology. The app runs **Ouvir → Cortar → Triagem → Frases
and ends there** (owner decision, 2026-09-01; ENG-689/ENG-691): the cuts, scenes and
phrases are kept by the autosave for a different system to consume, and the app itself
produces no artifact. The meaning interview will return later, in another flow and
another product; ENG-691 removed the last of its rules from `domain/` and `contracts/`.

This is a complete from-scratch implementation. The v1 prototype
(`docs/reference/index.html`) survives only as the executable behavior contract — never
modify it, save for the one exception registered in `CLAUDE.md` (ENG-604), which took an
owner decision. **Read `CLAUDE.md` and `docs/architecture.md` before writing code**; the
product spec is `docs/PRD-colar-de-sons-v2.md` and the visual spec is
`docs/PRD-redesign.md`.

## Architecture

Clean architecture in the practical sense — dependencies always point inward:

- `domain/` — pure TypeScript, zero framework/IO imports. Bead grid math, `manifest_id`
  hashing, frontier/seam rules, gates, triagem, phrases. **Frozen layer**: a 1:1
  behavioral port of the reference. The golden harness that guarded it was removed with
  the artifacts in ENG-691 — its own unit tests are now the only proof.
- `contracts/` — schema-validated DTOs: the session autosave document, the pipeline
  delivery/return imports, bucket and API payloads. **Frozen layer** (same rule).
- `adapters/` — API client, Web Audio playback, sessions/locks, bucket. Every adapter
  ships a **fixture mode**, so the whole app runs with no real API.
- `ui/` — the Shemá design system (atomic design) plus the flow stations. UI chrome is
  PT-BR by default with an EN toggle (`ui/i18n/`). Everything committed — issues, PRs,
  commits, `docs.md` — is English.

## Getting started

```bash
# Node >= 22.12 (fnm use 22) · pnpm via corepack
pnpm install
pnpm dev        # Vite dev server — fixture mode by default (no API needed)
```

To run against a real `tripod-api`, copy `.env.example` to `.env.local` and set
`VITE_API_MODE=real` plus the API base URL.

## Commands

```bash
pnpm typecheck        # tsc --noEmit (strict)
pnpm lint             # eslint + prettier --check
pnpm depcruise        # layer boundaries (dependency-cruiser)
pnpm test             # vitest unit+dom with per-layer coverage
pnpm test:browser     # interaction-critical organisms in real Chromium
pnpm e2e              # Playwright acceptance suite (CI)
pnpm e2e:awake        # e2e on macOS: holds the display awake (a sleeping display
                      #   freezes Chromium input acks in ~15s pulses — see tests/e2e/docs.md)
```

## Quality gates

Required checks on every PR: `typecheck` · `lint` · `depcruise` · `test`. No PR merges
red. The `golden-harness` check that headed this list was removed in ENG-691 along with
the artifacts it byte-diffed against the reference — see `CLAUDE.md` for what that costs.
Details and anti-gaming rules live in `CLAUDE.md` (Quality gates).

## Deployment

Google Cloud Run, same shape as `tripod-console` and `meaning-map-ui`: a container builds
the static bundle and serves it through nginx, which reverse-proxies `/api` to the backend
resolved at container start. Pushing to `main` runs `.github/workflows/deploy.yml`. The
one-time GCP setup, the decisions behind the choice, and the known first-deploy pitfall
(GCS bucket CORS) are in `docs/deploy-gcloud.md`.

## Workflow

The backlog lives in Linear (project **Sound Necklace**). One issue = one branch = one
small PR; the issue body is the complete brief. `contract-critical` issues (anything
touching `contracts/` or `domain/`) stop for human review; `loop-ready` issues may merge
on green CI.
