# Deploy — Google Cloud Run

**Status:** proposed (2026-07-30). The files exist and the image was verified locally;
nothing has been deployed yet. The one-time GCP setup in §5 is still outstanding.

The target is the same shape three sibling repositories already use — `tripod-console`,
`meaning-map-ui` and `oral-collector` all build a container, push it to Artifact Registry
and run it on Cloud Run in `us-central1`. This document explains what was copied, what was
changed for this repo, and what a human still has to do in the GCP console.

## 1. The decision

**Cloud Run, serving the static build through nginx.** Not because it is the cheapest or
the simplest option for a static SPA in the abstract — Firebase Hosting is both, and
Google's own Architecture Center steers a pure static site there first. It wins here for
three concrete reasons:

1. **One deploy mechanism for the whole org.** The same `GCP_PROJECT_ID` / `GCP_SA_KEY`
   GitHub secrets, the same Artifact Registry layout, the same `gcloud run deploy` shape,
   the same Secret Manager project (`shemaobt-secrets`). A fourth product surface for one
   more small app buys nothing and costs everyone a second thing to know.
2. **The nginx `/api` proxy removes the build-time API URL entirely** (§3). On Firebase
   Hosting the same trick needs a `rewrites` rule to Cloud Run, which is a different
   mechanism to learn and debug.
3. **Cost is a rounding error either way** at a few dozen users, with `min-instances=0`.

The cost of the choice: a container base image to keep patched, and a cold start on the
first request after idle. Both are acceptable; neither is free. If the cold start ever
shows up as a complaint from facilitators, `--min-instances=1` is the knob — do not set it
preemptively.

## 2. What is in the repository

| File | Role |
| --- | --- |
| `Dockerfile` | Two stages: `node:22-alpine` + corepack pnpm builds `dist/`; `nginx:stable-alpine` serves it on 8080. |
| `nginx.conf` | Template. `${BACKEND_URL}` is a placeholder, substituted at container start. |
| `docker-entrypoint.sh` | `envsubst` the template, then `exec nginx`. Fails fast if `BACKEND_URL` is unset. |
| `.dockerignore` | Keeps `node_modules/`, `dist/`, worktrees and env files out of the build context. |
| `.github/workflows/deploy.yml` | Build → push → read the backend URL from Secret Manager → `gcloud run deploy`. |

The required checks in `.github/workflows/ci.yml` are untouched. It gains one
**additional, non-required** job, `docker-build`: it builds this image, starts it, and
asserts both that the SPA is served and that the container refuses to start without
`BACKEND_URL`. No push, no GCP, no secret. It exists because the deploy fires on push to
`main` — the merge *is* the first deploy — so without it a broken `Dockerfile` or a
lockfile drift would only surface after merging.

## 3. Configuration: what is baked in, what is not

The SPA reads three `VITE_*` variables. Two are in `ui/app/api-config.ts`:

- **`VITE_API_MODE`** — baked into the image as `real` (`Dockerfile`, builder stage). This
  is the one build-time decision: a production image is always a real-API image. Fixture
  mode stays the default for local dev, CI and the E2E lane, which never build this image.
- **`VITE_API_BASE_URL`** — deliberately **not** set. Unset, `api-config.ts` falls back to
  the relative `/api`, and nginx proxies that path to whatever `BACKEND_URL` the container
  received at start. So the backend can move without rebuilding the image, and the browser
  only ever talks to its own origin for the API.

The third is **`VITE_VOICE`** (`ui/app/App.tsx`), and it is also left unset — unset means
the real microphone, which is what production wants. Named here because it is the variable
someone will come looking for while debugging "the recorder is a fixture in production",
which has happened once before (ENG-298).

`BACKEND_URL` reaches the container as a plain Cloud Run env var. CI reads it fresh from
Secret Manager on every deploy (`sound_necklace_backend_url` in project `shemaobt-secrets`),
matching `tripod_console_backend_url` and `meaning_map_ui_backend_url`.

Two deviations from `tripod-console`'s nginx config, both deliberate:

- **No CORS headers on `/api`.** After the proxy the call is same-origin. The headers there
  are vestigial.
- **`client_max_body_size 16m`** (nginx default is 1m). Voice answers upload as WebM/Opus
  through `PUT /api/sound-necklace/sessions/{id}/resources` — through this proxy, not via
  a signed URL — and at the default nginx would answer 413. Not higher than 16m: Cloud Run
  already caps a request at 32 MiB, and nginx buffers request bodies to `/var/cache/nginx`,
  which there is RAM against `--memory=256Mi`. A minute of WebM/Opus is roughly 200 kB.
  Downloads go direct to GCS and never touch nginx.
- **`gzip_types` is set explicitly.** `gzip on` alone compresses only `text/html` —
  nginx's default, and it does not extend implicitly. Without the list the JS bundle ships
  raw (~730 kB instead of ~236 kB), and Cloud Run does not compress on your behalf.
- **`location ^~ /api`, not a bare prefix.** A regex location beats a prefix location in
  nginx, so without `^~` any API route ending in one of the static-asset extensions would
  be served off disk and 404 instead of being proxied.

## 4. Verified locally

Built and run on 2026-07-30 against the live backend
(`https://tripod-backend-f7ssqjozfq-uc.a.run.app`):

- `GET /` → 200 `text/html`.
- `GET /dashboard/<anything>` → 200 — client-side routing falls back to `index.html`.
- `index.html` → `Cache-Control: no-cache, no-store, must-revalidate`.
- Hashed asset → a single `Cache-Control: public, max-age=31536000, immutable`, and
  `Content-Encoding: gzip` (uncompressed it is 729 721 bytes).
- `GET /api/auth/me` through the proxy returns byte-identical output to the same call made
  directly against the backend (`{"detail":"Not authenticated","code":"UNAUTHORIZED"}`),
  including when `BACKEND_URL` carries a trailing slash.
- `GET /api/nao-existe.js` returns the backend's `{"detail":"Not Found"}` rather than an
  HTML 404 off disk — that is the `^~` precedence fix doing its job.
- **`VITE_API_MODE=real` is genuinely baked**: the same build with `fixture` produces a
  different bundle hash (`index-Da8L-1Ok.js` vs `index-CwKbJAxO.js`). Worth asserting
  rather than assuming — a silently-unbaked mode gives an app that looks entirely healthy
  until someone tries to log in.
- Starting the container without `BACKEND_URL` exits immediately with a named error.
- No error lines in the nginx log.

Not verified by running it: the deploy itself. The GCP state in §5 was read with `gcloud`
(read-only) on 2026-07-30.

## 5. One-time setup, before the first deploy

The target project is **`gen-lang-client-0886209230` ("OBT Lab")**, number `718681737495`,
region `us-central1` — where every sibling service already runs, including
`tripod-backend` at `https://tripod-backend-f7ssqjozfq-uc.a.run.app`. None of this is
scripted anywhere in the organization; the siblings were set up by hand too.

1. **Artifact Registry — already done.** The Docker repository `sound-necklace` exists in
   `us-central1` in that project, and is empty. Nothing to do.
2. **Service account** — one deployer per app is the house pattern
   (`tripod-console-deployer`, `oral-collector-github-deployer`, …), and there is no
   `sound-necklace` one yet. Create it and give it exactly the three roles
   `tripod-console-deployer` holds: `roles/artifactregistry.writer`,
   `roles/iam.serviceAccountUser`, `roles/run.admin`. Then a JSON key for `GCP_SA_KEY`.
3. **Secret Manager**: create `sound_necklace_backend_url` in project `shemaobt-secrets`
   holding `https://tripod-backend-f7ssqjozfq-uc.a.run.app` — the backend origin **without**
   the `/api` suffix, since nginx appends the full request URI and `/api` in the value
   would produce `/api/api/...`. Grant the new service account `secretAccessor` on it.
   The value is not confidential (it is already in this repo's `.env.example`); the reason
   it lives in Secret Manager is late binding — repointing the backend without a rebuild —
   plus keeping this workflow byte-identical to the siblings'. Hardcoding it in
   `deploy.yml` is a legitimate simplification if you would rather not add the secret.
4. **GitHub secrets**: `GCP_PROJECT_ID` and `GCP_SA_KEY` on this repository.
5. **GCS bucket CORS — currently fine, and worth keeping an eye on.** Audio is downloaded
   straight from GCS via signed URLs (`adapters/sessions/http.ts`, `getResource`), so the
   bucket's CORS allowlist has to contain the origin the SPA is served from. The live
   config on `gs://sound-necklace-private` is `origin: ["*"]` for `GET, HEAD`, which covers
   the Cloud Run `*.run.app` URL and any custom domain. **But `tripod-api` has a checked-in
   `sound-necklace-cors.json` that does not match reality** — it lists only the two
   localhosts and `https://soundnecklace.shemaywam.com`. Applying that file would narrow
   the bucket and break audio on `*.run.app`. Either leave the bucket alone, or fix the
   file before anyone applies it.
6. **Custom domain**: map `soundnecklace.shemaywam.com` to the Cloud Run service and add
   the DNS record. No sibling repo scripts this — it is console/`gcloud` work, and nothing
   depends on it for a first deploy now that CORS is open.

## 6. Deviations from current external best practice, knowingly accepted

Worth revisiting, not worth blocking this on:

- **Service-account JSON key instead of Workload Identity Federation.** WIF is Google's
  current recommendation and key-based CI auth has been discouraged since 2023. All four
  sibling repos use `credentials_json: ${{ secrets.GCP_SA_KEY }}`. Migrating one repo alone
  would leave the org split across two auth models; migrating all four is its own task.
- **`nginx:stable-alpine` running as root instead of `nginx-unprivileged`.** Copied from
  the siblings and proven there.
- **No security headers** (HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`).
  `oral-collector` ships a shared `security-headers.conf`; the two Vite SPAs do not. Adding
  them here is a small, self-contained follow-up.
- **No staging environment.** No sibling repo has one. Adding one is new design, not a
  pattern to copy.
