# Deploy — Google Cloud Run

**Status:** live since 2026-08-03 at
`https://sound-necklace-f7ssqjozfq-uc.a.run.app`. §5 is a record of the provisioning that
exists and how to re-check it, not a list of work to do — including the two IAM roles the
first deploy proved were missing. `deploy.yml` fires on every push to `main`.

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

Verified against the deployed service on 2026-08-03, at
`https://sound-necklace-f7ssqjozfq-uc.a.run.app`: `GET /` is 200 `text/html` and
`/dashboard/<anything>` falls back to it; `/api/auth/me` answers the backend's 401 JSON
through the proxy and `/api/nao-existe.js` its 404 JSON rather than HTML off disk; the
hashed asset carries `immutable` plus `Content-Encoding: gzip` while `index.html` is
`no-cache, no-store`; and the CSP, HSTS, `nosniff`, `Referrer-Policy` and `X-Frame-Options`
headers are all present on the response.

Still not verified: **an actual audio download from GCS under the CSP**. It is correct by
construction on all three axes — `getResource` (`adapters/sessions/http.ts`) fetches, so it
is governed by `connect-src`, which lists `https://storage.googleapis.com`; the API signs
URLs on that same host; and the bucket CORS allows `GET` from this origin. But nothing has
exercised it end to end, because doing so needs a real session and a login.

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
   with `roles/iam.workloadIdentityUser` on the SA for
   `principalSet://iam.googleapis.com/<pool>/attribute.repository/shemaobt/sound-necklace`
   and, on the project, `roles/artifactregistry.writer` + `roles/iam.serviceAccountUser` +
   `roles/run.admin` (`roles/run.developer` and `roles/iam.serviceAccountTokenCreator` are
   also still bound, from the first attempt, and are now redundant). **No JSON key** — that
   is the point of WIF.

   > **The `shema-infra` `github_deployer` module, as written, cannot deploy.** This SA was
   > first created to the module's shape — `run.developer` + `artifactregistry.writer` +
   > `iam.serviceAccountTokenCreator` — on the reasoning that the older live SAs had
   > "drifted" to `run.admin` + `iam.serviceAccountUser`. That was backwards: the drift was
   > the part that works. Two failures followed, on 2026-08-03, and both are worth knowing
   > before replicating this anywhere:
   >
   > 1. **`iam.serviceAccountUser` is required, and `iam.serviceAccountTokenCreator` is not
   >    a substitute.** Cloud Run runs a service *as* a service account — the compute
   >    default `718681737495-compute@developer.gserviceaccount.com` when `--service-account`
   >    is not passed, which is what the four sibling frontends do. Deploying therefore needs
   >    `iam.serviceAccounts.actAs` on it, which only `serviceAccountUser` grants. Without it:
   >    `ERROR: Permission 'iam.serviceAccounts.actAs' denied`.
   > 2. **`run.developer` cannot make the service public.** It lacks
   >    `run.services.setIamPolicy`, so `--allow-unauthenticated` fails to bind
   >    `allUsers` → `roles/run.invoker` and every request answers **403**. This one is
   >    nastier, because **the deploy step still exits 0** — the failure is a warning
   >    (`Setting IAM policy failed`) buried in the log, so CI reports a green deploy over a
   >    service nobody can reach. Read the log, or curl the URL, before believing a green
   >    deploy.

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

   > **Creating the mapping early costs a day, and that is the part worth knowing.** Right
   > after the first deploy the mapping was still `Ready: False`, and the reason was not the
   > certificate — it was `RouteMissing`, *"Route sound-necklace does not exist"*, the same
   > error as at creation time. The paired condition explains it:
   > `Retry: WaitingForOperation — System will retry after 24:00:00`. The mapping re-checks
   > for the route **once every 24 hours**, so a mapping created three days before the
   > service simply sits there, emitting no `resourceRecords` and provisioning no
   > certificate, until its next poll comes around.
   >
   > **Delete and recreate it once the service exists** — it is serving nothing, so there is
   > nothing to lose:
   >
   > ```sh
   > gcloud beta run domain-mappings delete --domain=soundnecklace.shemaywam.com \
   >   --region=us-central1 --project=gen-lang-client-0886209230 --quiet
   > gcloud beta run domain-mappings create --service=sound-necklace \
   >   --domain=soundnecklace.shemaywam.com --region=us-central1 \
   >   --project=gen-lang-client-0886209230
   > ```
   >
   > Done on 2026-08-03. The mapping immediately reported `DomainRoutable: True`, emitted
   > the `CNAME soundnecklace → ghs.googlehosted.com.` record (which DNS already had), moved
   > to `CertificatePending`, and dropped its retry interval from 24h to 1h. Nothing is left
   > for a human: issuing the managed certificate is Google's side, minutes to ~24h. Until
   > it lands, use the `*.run.app` URL.

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

6. **GCS bucket CORS — narrowed on 2026-07-31, and already complete.** Audio is downloaded
   straight from GCS via signed URLs (`adapters/sessions/http.ts`, `getResource`), so the
   bucket's CORS allowlist must contain the origin the SPA is served from.
   `gs://sound-necklace-private` used to be `origin: ["*"]` for `GET, HEAD` — not an access
   hole, since with signed URLs the signature is the credential, but wider than it needs to
   be. The live list is now:

   ```
   https://soundnecklace.shemaywam.com
   https://sound-necklace-f7ssqjozfq-uc.a.run.app
   https://sound-necklace-718681737495.us-central1.run.app
   http://localhost:5173
   ```

   **Both Cloud Run hostnames are in there, and neither needed the service to exist first.**
   Cloud Run's default hostname is not random per service: the legacy form
   `<service>-<hash>-<region>.a.run.app` derives its hash from the project and region — all
   14 services in this project share `f7ssqjozfq` — and the current form is
   `<service>-<project-number>.<region>.run.app`. Both were predictable, so both were
   listed in advance. Nothing about CORS is left for after the first deploy.

   **Where this is configured: by hand, with `gcloud`. Never by the API.** CORS is a
   property of the GCS bucket, not of the backend — no application code, workflow or
   startup path sets it. `tripod-api` checks in `sound-necklace-cors.json` as the reference
   copy, and its README says so outright: *"applied by hand and by nobody else."* That file
   and the live bucket currently match exactly. Because nothing enforces that, read the
   bucket before trusting the file:

   ```sh
   gcloud storage buckets describe gs://sound-necklace-private --format='json(cors_config)'
   # to change it, edit tripod-api/sound-necklace-cors.json and apply it from there:
   gcloud storage buckets update gs://sound-necklace-private \
     --cors-file=sound-necklace-cors.json
   ```

   `OPTIONS` does not belong in `method` — that list is the allowed *request* methods, and
   the preflight is implied. `PUT` does not either: the SPA only ever issues signed **GET**
   against GCS, since uploads go through `PUT /api/sound-necklace/sessions/{id}/resources`.
   `Range` stays in `responseHeader`, though not for the reason one might assume — an
   ordinary seek (`bytes=1048576-`) *is* CORS-safelisted and does not preflight; a suffix
   range (`bytes=-500`) is not.

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
