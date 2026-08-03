# Deploy — Google Cloud Run

**Status:** provisioned, not deployed (2026-07-31). The files exist, the image was verified
locally, and **the one-time GCP setup in §5 is done** — §5 is now a record of what exists
and how to re-check it, not a list of work to do. Do not re-run it. The one thing still
ahead is the deploy itself: `deploy.yml` fires on push to `main`, so merging this branch
*is* the first deploy.

The target is the same shape three sibling repositories already use — `tripod-console`,
`meaning-map-ui` and `oral-collector` all build a container, push it to Artifact Registry
and run it on Cloud Run in `us-central1`. This document explains what was copied, what was
changed for this repo, and what state GCP is already in.

## 0. What "the org pattern" actually is

There are three, and they do not fully agree. Worth knowing before reading the rest.

1. **What is live in five app repos** (`tripod-api`, `tripod-console`, `meaning-map-ui`,
   `oral-collector`, `obt-mentor-companion`): each repo builds its own image, pushes it to
   Artifact Registry tagged with the commit SHA, and runs `gcloud run deploy` on push to
   `main`. GCP resources themselves were created by hand.
2. **Auth is mid-migration.** Four of those five authenticate with a static service-account
   JSON key (`credentials_json: ${{ secrets.GCP_SA_KEY }}`). `obt-mentor-companion` uses
   **Workload Identity Federation**, and the pool `github-actions-pool` is ACTIVE in the
   project. WIF is the direction, not a proposal.
3. **The written-down target is Terraform**, in the private `shemaobt/shema-infra` repo:
   one `environments/<app>/` per app composing modules (`artifact_registry`,
   `github_deployer`, `cloud_run_service`, `secret`, `domain_mapping`), applied by CI. Its
   README is explicit that app-repo deploys — image build plus
   `gcloud run deploy --image=` — stay in the app repos and are unaffected. **That repo is
   stalled since 2026-04-28**: `environments/` never landed on `main`, and the plan/apply
   workflows are still open PRs (#4, #5, #6).

This PR does the app-repo half, which is identical under all three, and follows the WIF
direction rather than the older key-based majority. The infra half — an
`environments/sound_necklace/` in `shema-infra` — cannot be written yet: it would reference
`data.terraform_remote_state.shared`, and the `shared` env is exactly what open PR #4 adds.

## 1. The decision

**Cloud Run, serving the static build through nginx.** Not because it is the cheapest or
the simplest option for a static SPA in the abstract — Firebase Hosting is both, and
Google's own Architecture Center steers a pure static site there first. It wins here for
three concrete reasons:

1. **One deploy mechanism for the whole org.** The same GCP project and WIF pool, the same
   Artifact Registry layout, the same `gcloud run deploy` shape, the same Secret Manager
   project (`shemaobt-secrets`) — and the same modules in `shema-infra` once that repo is
   unblocked. A fourth product surface for one more small app buys nothing and costs
   everyone a second thing to know.
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
| `security-headers.conf` | CSP + HSTS + nosniff + Referrer-Policy, included per static location. |
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
- **The CSP does not break the app.** The five security headers are present on both the
  HTML and the hashed assets, and the repo's own e2e suite was pointed at the running
  container (a fixture-mode build of the same image, same nginx): **11 of 13 specs pass**,
  covering the full cycle — necklace, segmentation, interview, voice recording. The two
  that fail are `resilience.spec.ts`'s auth-expiry and foreign-lock cases, which call
  `__cds.seedForeignLock` — a seam gated behind `import.meta.env.DEV` in
  `ui/app/main.tsx` and therefore absent from a production bundle by design. Driving the
  app separately with a console listener recorded zero CSP violations and zero page
  errors, with 45 fonts loaded and the stylesheet applied.

Not verified by running it: the deploy itself. The GCP state in §5 was read with `gcloud`
(read-only) on 2026-07-30.

## 5. One-time setup — done on 2026-07-31; this is the record of it

**Everything in this section already exists.** It is written as "what is there, and the
command that proves it" so nobody redoes provisioning right before the first deploy.

The target project is **`gen-lang-client-0886209230` ("OBT Lab")**, number `718681737495`,
region `us-central1` — where every sibling service already runs, including
`tripod-backend` at `https://tripod-backend-f7ssqjozfq-uc.a.run.app`. None of this is
scripted anywhere in the organization; the siblings were set up by hand too.

1. **Artifact Registry — exists, pre-existing.** The Docker repository `sound-necklace`
   exists in `us-central1` in that project, and is empty until the first deploy pushes an
   image.

   ```sh
   gcloud artifacts repositories describe sound-necklace \
     --location=us-central1 --project=gen-lang-client-0886209230
   ```
2. **Service account — created.** `sound-necklace-github-deployer@gen-lang-client-0886209230.iam.gserviceaccount.com`,
   with the shape `shema-infra`'s `github_deployer` module defines: project roles
   `roles/run.developer` + `roles/artifactregistry.writer` +
   `roles/iam.serviceAccountTokenCreator`, and `roles/iam.workloadIdentityUser` on the SA
   for `principalSet://iam.googleapis.com/<pool>/attribute.repository/shemaobt/sound-necklace`.
   **No JSON key** — that is the point of WIF. Note the older live SAs drifted to
   `run.admin` where the module says `run.developer`; this one follows the module.

   ```sh
   gcloud iam service-accounts get-iam-policy \
     sound-necklace-github-deployer@gen-lang-client-0886209230.iam.gserviceaccount.com \
     --project=gen-lang-client-0886209230          # expect the workloadIdentityUser binding
   gcloud projects get-iam-policy gen-lang-client-0886209230 \
     --flatten=bindings[].members --format='value(bindings.role)' \
     --filter='bindings.members:sound-necklace-github-deployer'
   ```
3. **Secret Manager — created.** `sound_necklace_backend_url` in project `shemaobt-secrets`
   holds `https://tripod-backend-f7ssqjozfq-uc.a.run.app` — the backend origin **without**
   the `/api` suffix, since nginx appends the full request URI and `/api` in the value
   would produce `/api/api/...`. The service account has `secretAccessor` on it. The value
   is not confidential (it is already in this repo's `.env.example`); the reason it lives in
   Secret Manager is late binding — repointing the backend without a rebuild — plus keeping
   this workflow byte-identical to the siblings'.

   ```sh
   gcloud secrets versions access latest \
     --secret=sound_necklace_backend_url --project=shemaobt-secrets
   ```
4. **GitHub secrets — set on 2026-07-31.** `GCP_PROJECT_ID`,
   `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_WORKLOAD_IDENTITY_SERVICE_ACCOUNT` on this
   repository — the same three names `obt-mentor-companion` uses. No `GCP_SA_KEY`.

   ```sh
   gh secret list        # names and dates only; values are write-only by design
   ```
5. **Custom domain — already created, and parked on purpose.** Running

   ```sh
   gcloud beta run domain-mappings create --service=sound-necklace \
     --domain=soundnecklace.shemaywam.com --region=us-central1 \
     --project=gen-lang-client-0886209230
   ```

   before the service exists **creates the mapping and then reports**
   `ERROR: Route sound-necklace does not exist`. The error is about the target, not the
   creation — the resource is there, in `Ready: False` with a `Retry: True` condition
   ("System will retry"). It reconciles on its own once the first deploy creates the
   service. Re-running it just says the mapping already exists, which is the expected
   answer, not a problem. Done here on 2026-07-31.

   ```sh
   gcloud beta run domain-mappings describe --domain=soundnecklace.shemaywam.com \
     --region=us-central1 --project=gen-lang-client-0886209230
   ```

   The mapping lists no `resourceRecords` until it reconciles, but every sibling domain
   (`oralcollector`, `console`, `meaningmap`, …) uses the same record, so it can be created
   in advance:

   ```
   CNAME  soundnecklace  ->  ghs.googlehosted.com.
   ```

6. **GCS bucket CORS — narrowed on 2026-07-31, and it needs one step after the first
   deploy.** Audio is downloaded straight from GCS via signed URLs
   (`adapters/sessions/http.ts`, `getResource`), so the bucket's CORS allowlist must contain
   the origin the SPA is served from. `gs://sound-necklace-private` used to be
   `origin: ["*"]` for `GET, HEAD` — not an access hole, since with signed URLs the
   signature is the credential, but wider than it needs to be. It was narrowed to the
   known origins: the localhosts and `https://soundnecklace.shemaywam.com`.

   > **After the first deploy, add the generated `*.run.app` origin.** Cloud Run's default
   > hostname carries an unpredictable hash (`sound-necklace-<hash>-uc.a.run.app`), so it
   > could not be listed in advance — and now that the list is no longer `*`, audio
   > **will fail CORS on the Cloud Run URL** until it is added. The custom domain is
   > unaffected. This is the one provisioning step the first deploy leaves behind.

   ```sh
   gcloud storage buckets describe gs://sound-necklace-private \
     --format='json(cors_config)'          # read the live list first

   cat > /tmp/sn-cors.json <<'JSON'
   [{"origin":["http://localhost:5173","https://soundnecklace.shemaywam.com","https://<the Cloud Run URL>"],
     "method":["GET","HEAD"],"maxAgeSeconds":3600,
     "responseHeader":["Content-Type","Content-Length","Content-Range","Range"]}]
   JSON
   gcloud storage buckets update gs://sound-necklace-private --cors-file=/tmp/sn-cors.json
   ```

   `OPTIONS` does not belong in `method` — that list is the allowed *request* methods, and
   the preflight is implied. `Range` must stay in `responseHeader`: it is not a
   CORS-safelisted request header, so seeking in a long recording preflights.

   **`tripod-api` has a checked-in `sound-necklace-cors.json` that does not match the live
   bucket** — it lists only the two localhosts and `https://soundnecklace.shemaywam.com`,
   with `PUT` and `OPTIONS` this app never issues against GCS. Nothing applies it
   automatically, but applying it by hand would narrow the bucket and break audio on the
   `*.run.app` URL. Fix or delete it.

## 6. Deviations from current external best practice, knowingly accepted

Worth revisiting, not worth blocking this on:

- **`nginx:stable-alpine` running as root instead of `nginx-unprivileged`.** Copied from
  the siblings and proven there.
- **The two Vite SPAs ship no security headers.** This one does (`security-headers.conf`,
  modelled on `oral-collector`'s), so it is ahead of the siblings rather than behind them.
- **No staging environment.** No sibling repo has one. Adding one is new design, not a
  pattern to copy.
- **The four older repos still authenticate with a static JSON key.** This one does not,
  which is the direction — but it does leave the org on two auth models until they migrate.
  Worth doing, and it is a `shema-infra` job, not a per-repo one.
