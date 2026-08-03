# Noridoc: adapters/bucket

Path: @/adapters/bucket

### Overview

- The `BucketSource` port (ENG-241, PRD §7.4): the project bucket is the **only** MVP audio source. `list()` returns the bucket audios (each carrying its acousteme envelope and a collection-consent flag, §12/O6) and `fetchBytes(id)` returns the audio bytes the Setup station decodes into a grid + `manifest_id`.
- Audio bytes are **opaque** (§10.5): the port returns a raw `ArrayBuffer` and knows nothing about the format. In fixture mode the bytes are a `PcmSpec`-as-JSON — exactly what @/adapters/audio's `FixtureAudioEngine.decode` consumes — so the whole fixture Setup→decode→grid→hash flow runs with no network and no real WAV. In real mode the server serves a WAV to the real Web Audio engine.
- Ships fixture and real implementations plus a self-registering `register.ts`, same shape as @/adapters/audio (see @/adapters/docs.md).

### How it fits into the larger codebase

- Resolved by the composition root @/ui/app via the `bucket` port name (`import.meta.glob('/adapters/*/register.ts')`, @/docs/architecture.md §4). Fixture is the default; the real mode activates by environment config (ENG-247).
- The Setup station (ENG-243) is the consumer: it lists audios, shows the consent indicator, passes the chosen audio's acousteme to the `granularity` port to get a `beadSec`, then `fetchBytes` → `AudioEngine.decode` → domain grid/hash → `SessionStore.create`.
- DTOs come from @/contracts/bucket.ts (`BucketAudio`, `BucketListResponseSchema`); the fixture data lives in @/fixtures/bucket/audios.ts. Per @/.dependency-cruiser.cjs this folder may not import `ui/`.

### Core Implementation

- **`FixtureBucketSource`** (@/adapters/bucket/fixture.ts, the DEFAULT): serves the entries from @/fixtures/bucket/audios.ts. `list()` deep-clones each `BucketAudio` (opaque custody — never leaks the internal reference); `fetchBytes(id)` encodes the entry's `PcmSpec` as JSON bytes and throws `BucketAudioNotFoundError` for an unknown id.
- **`HttpBucketSource`** (@/adapters/bucket/http.ts, the real wire since ENG-247): an injected `fetch` (no network in CI) and an optional Bearer token, against the endpoints the tripod-api actually serves. `list()` resolves the project through an injected `projectId` callback (@/ui/app/bucket-adapter.ts supplies it), calls `GET /sound-necklace/projects/{project_id}/audios` and validates the response against `BucketListResponseSchema`. `fetchBytes(id)` is **two hops**: `GET /sound-necklace/audios/{id}/url` mints a short-lived signed URL, then that URL is fetched **without** the Bearer — the second hop goes to storage, not to the API — and `res.arrayBuffer()` is returned untouched (opaque custody). A 404 on the signing hop is what raises `BucketAudioNotFoundError`.
- **`register.ts`** wires the port: `fixture: () => new FixtureBucketSource()`, `real` builds an `HttpBucketSource` defaulting to a relative `/api` baseUrl and the browser fetch. Its `RealBucketWiring` makes every field optional **except `projectId`** — the composition root cannot leave the project unresolved, because there is no sensible default for "which project's audios".

### Things to Know

- **Fixture bytes are `PcmSpec` JSON, not WAV** — this is forced by the already-merged fixture audio engine (ENG-217), which decodes `PcmSpec` JSON via a bit-identical LCG. The DoD's "WAV" wording refers to the real/HTTP path; the port is format-agnostic opaque bytes.
- Fixture `duration_sec` equals `samples / sampleRate` so the announced metadata matches the decoded duration. The three entries cover the two axes Setup exercises: consent present/absent and acousteme present/null (plus mono/stereo).
- Never commit real community audio under @/fixtures/bucket — only synthetic PCM (LGPD, PRD §12).
- **An empty real-mode listing is almost never a permission problem.** The API's listing does not read the storage bucket: it reads a per-project binding table and joins it to the acousteme artifacts by a caller-minted `audio_id`, with no foreign key. An acousteme artifact is standalone by design — no project, no recording — so audio whose bytes and artifact both exist is still invisible until something binds it to a project, and the API answers **200 with an empty array** rather than an error. Missing permission would surface as a 403 and break the whole screen instead. This bit production on 2026-08-03: the binding table was empty, so every project listed zero audios.
- The `register.ts` re-declares a local `AdapterRegistration<TPort>` shape matching @/adapters/audio; the composition-root registry consumes `{ port, fixture, real }` by name.

Created and maintained by Nori.
