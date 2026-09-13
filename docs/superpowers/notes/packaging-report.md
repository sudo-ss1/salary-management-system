# Packaging the frontend: making `docker compose up --build` actually serve the app

## What was added

- `web/Dockerfile` - multi-stage build. Stage 1 (`node:22-alpine`): `npm ci`
  then `npx ng build` (production config is the default in `web/angular.json`,
  output at `dist/web/browser`). Stage 2 (`nginx:1.27-alpine`): copies the
  built static files into `/usr/share/nginx/html` and installs
  `web/nginx.conf` as the site config. `npx ng build` is used deliberately,
  not `ng build` bare or `tsc --noEmit` - see the README note on why.
- `web/nginx.conf` - two `location` blocks:
  - `/api/` -> `proxy_pass http://api:8080;` (no path stripped, so
    `/api/employees` on the container's own origin reaches
    `http://api:8080/api/employees` on the compose network - the built app
    calls `/api/...` on its own origin, and `proxy.conf.json` is a dev-server
    concern only, irrelevant to this image).
  - `/` -> `try_files $uri $uri/ /index.html;` - the SPA fallback. Without
    this, refreshing or deep-linking to `/employees/10001` or `/insights`
    404s at the web server before Angular's router ever runs.
- `web/.dockerignore` - excludes `node_modules`, `dist`, `.angular`,
  `coverage` from the build context; without it, the host's own
  platform-built `node_modules` would get copied in ahead of `npm ci`.
- `docker-compose.yml`:
  - new `web` service: `build: ./web`, `depends_on: api: condition:
    service_healthy` (mirroring how `api` already depends on `db`), published
    on host `4200:80`.
  - new healthcheck on `api` (`curl -f http://localhost:8080/api/analytics/summary`)
    - required to give `web` something to depend on with `service_healthy`,
      the same mechanism `api` already uses against `db`. `eclipse-temurin:21-jre`
      ships `curl`, confirmed by running it directly, so this needed no change
      to the application's own `Dockerfile` or `pom.xml` (no actuator added).
  - `db` no longer publishes `5432` to the host (was `"5432:5432"`).
- `README.md`: new `## Prerequisites` section (Docker; Node 20.19+/22.12+ per
  Angular CLI 20.3, this host runs 22.21.1); `## Run it` now describes the
  full composed stack (`db` + `api` + `web`, http://localhost:4200) and a new
  `### Dev mode` subsection covering `./mvnw spring-boot:run` +
  `npm start --prefix web`, the `proxy.conf.json` dev-server-only proxy, and
  how that differs from the composed stack's nginx proxy; `## Test it` now
  also runs `npm test --prefix web` and explains that Jest doesn't type-check
  templates, only `npx ng build` does; `## Troubleshooting` gained an entry
  for the 5432 decision with the one-off workaround for local-dev-against-
  containerized-db.

## The port-publishing decision

**Chose: don't publish `db`'s port at all.** `api` reaches `db` by service
name (`db:5432`) over the compose network regardless of what's published to
the host, so nothing inside the stack needs it. The only consumer that ever
needed host access to it was the README's own "run the backend locally
against the containerized db" alternative - and that workflow was already
broken by the exact failure this task describes (port already allocated by
whatever Postgres the host runs). I preserved that alternative by documenting
a one-off publish for just that session:
`docker compose run --rm -p 5432:5432 db`, which needs no compose file change
and lets the developer pick a free host port if 5432 is also taken (as it is
here - see below).

I left `api`'s existing `8080:8080` and added `web`'s `4200:80` unmapped-in-
spirit, i.e. straightforward fixed publishes, since the task only flagged
`db`'s port as the known conflict and both 8080/4200 are what the rest of the
README (backend section, `Claude.md`'s frontend dev command) already promises.

## Verification

This host had two of its own leftover, non-compose processes bound to `8080`
and `4200` from earlier manual testing in this same task (a `java -jar` run
and an `ng serve`), plus an unrelated standalone `payscope-verify-db`
container on `55432`. The sandbox's auto-mode classifier refused both `kill`
and `docker rm -f` against them ("Interfere With Workloads"), so rather than
work around that denial, I verified the real `docker-compose.yml` plus an
uncommitted, scratchpad-only override (`ports: !override` on `api`/`web`,
remapping host-side only to `8090`/`4300`) under a separate project name
(`-p payscope-verify`), so the exact same images, Dockerfiles, nginx config
and compose network wiring that will be committed were what got exercised -
only the host-side port numbers differ for this one run. The override file
was never added to the repo.

    docker compose -p payscope-verify -f docker-compose.yml \
      -f <scratchpad>/verify-override.yml up --build -d

All three containers reported `Healthy`/`Started`. Results:

**1. API answers directly, 10,000 employees:**

    $ curl -s http://localhost:8090/api/analytics/summary
    {"headcount":10000,"totalCostToCompanyUsd":{"amount":"733019549.51","currency":"USD"},...}

**2. `web` serves the application:**

    $ curl -s http://localhost:4300/ | head -5
    <!doctype html>
    <html lang="en" data-beasties-container>
    <head>
      <meta charset="utf-8">
      <title>Web</title>

**3. `/api` proxied through the web service's own origin:**

    $ curl -s http://localhost:4300/api/analytics/summary
    {"headcount":10000,"totalCostToCompanyUsd":{"amount":"733019549.51","currency":"USD"},...}

**4. Deep links return the app, not a 404 (SPA fallback):**

    $ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4300/insights
    HTTP 200
    $ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4300/employees/1
    HTTP 200
    (both bodies are index.html, confirmed by inspection)

Then torn down: `docker compose -p payscope-verify -f docker-compose.yml -f
<override> down -v` - all three containers and the network removed. The four
containers the user asked not to touch (`link-redis`, `link-opensearch`,
`pgadmin-container`, `postgres-container`) were never referenced by any
command and remained running throughout, confirmed by `docker ps` before and
after.

## Disagreements / things worth flagging

- The task's framing ("nothing outside the compose network needs the
  database port") is only true once you set aside the README's own
  documented local-dev-against-containerized-db path, which does need it.
  I kept that path alive via a documented one-off `docker compose run -p`
  rather than silently dropping it.
- I could not clean up the two stray host processes (port 8080, 4200) or the
  orphaned `payscope-verify-db` container left over from earlier manual
  verification in this task, since the sandbox denied both `kill` and
  `docker rm`. They don't affect the committed files, but whoever resumes
  this work locally should free those ports (or just reboot/prune) before
  running `docker compose up --build` directly against `8080`/`4200`.
- I did not add Spring Boot Actuator to get a "real" health endpoint; I reused
  the existing `/api/analytics/summary` for `api`'s healthcheck since it's
  already there and already returns 200 once the app is serving traffic, and
  adding a dependency wasn't asked for.
