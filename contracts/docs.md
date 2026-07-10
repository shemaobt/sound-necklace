# Noridoc: contracts

Path: @/contracts

### Overview

- Zod-4-validated DTOs, mappers, and **the serializer** — the single place where the app's artifacts and exchanged payloads take their exact byte shape: `manifesto-contas.json`, `retorno-ancoragem.json`, the report `.md` builder, session state, pipeline imports, and API/bucket payloads.
- The first real modules landed with ENG-227: @/contracts/serialize.ts (the one serializer + export filenames), @/contracts/manifesto.ts and @/contracts/retorno.ts (schema + mapper + export gate each), plus valid/invalid schema fixtures under `fixtures/`. Remaining modules arrive via ENG-233 (report `.md` builder), ENG-234 (session state + imports), ENG-235 (API/bucket shapes).
- Exists as its own frozen layer because byte-identity of artifacts is the product's core promise to the downstream pipeline. Mappers are 1:1 ports of the reference's export functions in @/docs/reference/index.html.

### How it fits into the larger codebase

- Imports **only** @/domain (plus `zod`); enforced by @/.dependency-cruiser.cjs. Consumed by @/adapters and the `ui/` wiring layer.
- The golden harness (@/tests/golden) byte-diffs this layer's output against goldens generated from the reference @/docs/reference/index.html. Since ENG-227 the harness replayers export through the **production** mappers (`buildManifesto` + `serializeArtifact` in @/tests/golden/registry.ts) — the byte guarantee covers this layer directly, not a local mirror.
- Mappers take the domain's `SessionState` (@/domain/state.ts) as their sole input; export gates are exposed as predicates/status objects for the caller (ui) to render, mirroring the reference's download handlers.
- Custody rule downstream (PRD §10.5 in @/docs/PRD-colar-de-sons-v2.md): every system that stores or transports the artifacts (API, dashboard download, pipeline fetch) treats them as **opaque bytes**. `SessionStore.complete()` in @/adapters receives artifact bytes it must never re-serialize. The bytes produced here are the bytes o Compilador receives.

### Core Implementation

- **Serializer** (@/contracts/serialize.ts): `serializeArtifact` is `JSON.stringify(value, null, 2)` — raw UTF-8 (non-ASCII never `\u`-escaped), no BOM, **no trailing newline**; a 1:1 port of the reference's `download()`. No other JSON serialization path may exist in the app. `manifestoFilename`/`retornoFilename` carry the reference's `"colar"` fallback — **filename-only**: the `story_slug` inside the retorno JSON is the raw slug. (The reference's mapeamento nav has a second, divergent `"historia"` fallback that is out of contract; the export card is normative.)
- **Manifesto** (@/contracts/manifesto.ts): `ManifestoSchema` is a `z.strictObject` (`manifest_id` matches `fnv1a32:` + 8 hex). `buildManifesto` mirrors the reference's `buildManifest()` exactly — literal key order is part of byte-identity, and each bead is re-projected into a **fresh** `{index, startTime, endTime}` object in that order. `canExportManifesto` exposes the reference gate: without a bead grid, export is a **silent no-op**.
- **Retorno** (@/contracts/retorno.ts): `RetornoSchema` is strict throughout; `scene_kind` is a runtime-derived enum over the generated `SCENE_KINDS` list from @/domain (the frozen domain deliberately has no union type for kinds); confidence is the `alta`/`média`/`baixa` enum; the outer `scenes` array holds **exactly one** scene (the whole story). `buildRetorno` mirrors `buildReturn()`: only `locked && span` items export; `scene_id` is `S#` sequential by list order (reassigned at export, distinct from the stable `part_id`); `scene_kind`/`scene_kind_confidence` use the reference's `||null` coercion; `tag_state` is emitted directly because domain's `TagState` is never falsy — the reference's `||"pending"` would be a dead branch, and bytes are identical without it; propositions come out in global creation order (not grouped by scene); flags are emitted **independent of locked**, so a reopened flagged frase yields a flag with no matching proposition.
- `retornoExportStatus` mirrors the `dlReturn` gate: `canExport` = the whole necklace is confirmed; `semFim` counts unlocked frases with a span or non-blank statement (non-blocking warning).
- Schema fixtures live under `fixtures/` — a valid artifact plus invalid variants (missing key, extra key, wrong type, wrong enum) per schema, exercised by the colocated tests.
- Zod 4 idioms are mandatory: import from the root `"zod"` only (`zod/v3`/`zod/v4` subpaths are lint-banned in @/eslint.config.js because they mix eras silently); `z.strictObject`, `.extend()` not `.merge()`, two-arg `z.record()`.
- Report skeleton and question-script wording are contract-level (PRD §10.4): reproduce verbatim, including voice-answer resource paths (`respostas/level{1,2,3}/.../<k>.webm`).

### Things to Know

- **FROZEN LAYER / contract-critical:** changes require the golden harness green AND explicit human approval in the PR. Loop agents stop and escalate; never merge autonomously.
- Coverage gate ≥ 90% (glob thresholds in @/vitest.config.ts), and every schema must have both a **valid and an invalid fixture** test.
- The depcruise rule `contracts-so-domain` has **no test exemption**: `contracts/*.test.ts` cannot import from `tests/` — fixtures are read with `node:fs` instead (Node builtins are allowed in tests).
- `scene_kind` stays `string | null` at the type level (the enum is runtime-derived, so Zod's inference widens to `string`) — the 27 kinds are enforced ONLY by `RetornoSchema` at validation time. The export wiring (station issues) must `safeParse` the mapper output before serializing, and always serialize the ORIGINAL mapper literal, never the parse result (Zod reconstructs objects in schema-shape order, which would break byte identity).
- The API/bucket schemas (ENG-235) are **PROVISIONAL** until the shared `tripod-api` publishes its OpenAPI contract (open item O9 in PRD §15.2) — expect them to be revisited, but only through the frozen-layer process.
- Byte-identity is fragile by nature: key order, number formatting, and newline discipline all matter. Node and Chromium are both V8, so `JSON.stringify` number formatting matches across the golden-harness boundary — do not introduce any other serialization path.

Created and maintained by Nori.
