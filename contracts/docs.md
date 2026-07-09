# Noridoc: contracts

Path: @/contracts

### Overview

- Zod-4-validated DTOs, mappers, and **the serializer** — the single place where the app's artifacts and exchanged payloads take their exact byte shape: `manifesto-contas.json`, `retorno-ancoragem.json`, the report `.md` builder, session state, pipeline imports, and API/bucket payloads.
- Currently a scaffold — @/contracts/index.ts is a barrel with a layer marker. Modules arrive via the E1 issues: ENG-227 (manifesto/retorno + serializer), ENG-233 (report `.md` builder), ENG-234 (session state + imports), ENG-235 (API/bucket shapes).
- Exists as its own frozen layer because byte-identity of artifacts is the product's core promise to the downstream pipeline.

### How it fits into the larger codebase

- Imports **only** @/domain (plus `zod`); enforced by @/.dependency-cruiser.cjs. Consumed by @/adapters and the `ui/` wiring layer.
- The golden harness (@/tests/golden) byte-diffs this layer's serializer output against goldens generated from the reference @/docs/reference/index.html — the serializer must match the reference byte for byte.
- Custody rule downstream (PRD §10.5 in @/docs/PRD-colar-de-sons-v2.md): every system that stores or transports the artifacts (API, dashboard download, pipeline fetch) treats them as **opaque bytes**. `SessionStore.complete()` in @/adapters receives artifact bytes it must never re-serialize. The bytes produced here are the bytes o Compilador receives.

### Core Implementation

- Serialization contract (recorded in @/docs/architecture.md §5): JSON artifacts are `JSON.stringify(x, null, 2)` with **no trailing newline**; the report `.md` is lines joined with `\n` and **one trailing newline** — exactly as the reference serializes.
- Zod 4 idioms are mandatory: import from the root `"zod"` only (`zod/v3`/`zod/v4` subpaths are lint-banned in @/eslint.config.js because they mix eras silently); `z.strictObject`, `.extend()` not `.merge()`, two-arg `z.record()`.
- Report skeleton and question-script wording are contract-level (PRD §10.4): reproduce verbatim, including voice-answer resource paths (`respostas/level{1,2,3}/.../<k>.webm`).

### Things to Know

- **FROZEN LAYER / contract-critical:** changes require the golden harness green AND explicit human approval in the PR. Loop agents stop and escalate; never merge autonomously.
- Coverage gate ≥ 90% (glob thresholds in @/vitest.config.ts), and every schema must have both a **valid and an invalid fixture** test.
- The API/bucket schemas (ENG-235) are **PROVISIONAL** until the shared `tripod-api` publishes its OpenAPI contract (open item O9 in PRD §15.2) — expect them to be revisited, but only through the frozen-layer process.
- Byte-identity is fragile by nature: key order, number formatting, and newline discipline all matter. Node and Chromium are both V8, so `JSON.stringify` number formatting matches across the golden-harness boundary — do not introduce any other serialization path.

Created and maintained by Nori.
