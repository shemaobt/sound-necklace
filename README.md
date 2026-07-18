# Colar de Sons — Sound Necklace

An ear-first web app where a facilitator and a listener from an oral culture segment a
recorded oral story — a necklace of audio beads — into scenes and phrases, classify the
scenes against the Ruth ontology, and answer meaning questions by voice. Each completed
session exports three artifacts (`retorno-ancoragem.json`, `manifesto-contas.json`,
`relatorio-mapeamento.md`) consumed by the downstream pipeline ("o Compilador").

This is a complete from-scratch implementation. The v1 prototype
(`docs/reference/index.html`) survives only as the executable behavior contract — never
modify it. **Read `CLAUDE.md` and `docs/architecture.md` before writing code**; the
product spec is `docs/PRD-colar-de-sons-v2.md` and the visual spec is
`docs/PRD-redesign.md`.

## Architecture

Clean architecture in the practical sense — dependencies always point inward:

- `domain/` — pure TypeScript, zero framework/IO imports. Bead grid math, `manifest_id`
  hashing, frontier/seam rules, gates, the interview scripts. **Frozen layer**: a 1:1
  behavioral port of the reference, guarded by the golden harness.
- `contracts/` — schema-validated DTOs and artifact builders. **Frozen layer** (same
  rule).
- `adapters/` — API client, Web Audio playback, voice recording (MediaRecorder →
  WebM/Opus), TTS, sessions/locks. Every adapter ships a **fixture mode**, so the whole
  app runs with no real API.
- `ui/` — the Shemá design system (atomic design) plus the flow stations. UI chrome is
  PT-BR by default with an EN toggle (`ui/i18n/`); **exported artifacts are frozen PT-BR
  and never routed through i18n**.

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
pnpm golden           # golden harness — THE merge gate
pnpm e2e              # Playwright acceptance suite (CI)
pnpm e2e:awake        # e2e on macOS: holds the display awake (a sleeping display
                      #   freezes Chromium input acks in ~15s pulses — see tests/e2e/docs.md)
```

## Quality gates

Required checks on every PR: `golden-harness` · `typecheck` · `lint` · `depcruise` ·
`test`. No PR merges red. The golden harness replays scripted decision sets through
`domain/` and byte-diffs the produced artifacts against the reference's outputs — it is
the one gate that can never be relaxed. Details and anti-gaming rules live in
`CLAUDE.md` (Quality gates).

## Workflow

The backlog lives in Linear (project **Sound Necklace**). One issue = one branch = one
small PR; the issue body is the complete brief. `contract-critical` issues (anything
touching `contracts/` or `domain/`) stop for human review; `loop-ready` issues may merge
on green CI.
