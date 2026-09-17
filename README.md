# Payscope

Salary management and pay insights for an HR team operating across several
countries. See `requirements.md` for scope and `docs/superpowers/specs/` for the
design.

**Live application:** <https://payscope-mv6p.onrender.com> · **Demo video:** <https://www.loom.com/share/d7ce06d75a7e48a395437f67275775b3>

The hosted instance runs on a free tier and sleeps when idle, so the first
request after a quiet spell takes up to a minute to wake. Every request after
that is immediate.

Running it locally is an alternative, not the main route — everything below the
next two sections is for reading the code rather than seeing the product.

## Prerequisites

- Docker, for the composed stack and for `./mvnw test` (Testcontainers).
- Node 20.19+ or 22.12+ and npm, to run the frontend outside Docker. Angular
  CLI 20.3 (see `web/package.json`) requires it; this repo is built and
  tested on Node 22.

## Run it

    docker compose up --build

This builds and starts the whole stack: `db` (Postgres), `api` (Spring Boot,
seeding 10,000 employees), and `web` (the Angular app, built and served by
nginx). Open http://localhost:4200. First build takes a few minutes;
subsequent starts are seconds.

Seeding runs just after the API starts accepting requests, so a request issued
in the first second or so can return `"headcount": 0`. That is the seed still
running, not a failure - retry and it will report 10,000.

### Dev mode

Run the backend and frontend as two separate local processes instead, each
with live reload:

    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
    npm start --prefix web

The frontend dev server (`ng serve`, port 4200) proxies `/api` to
`localhost:8080` via `web/proxy.conf.json`. That is a dev-server-only
mechanism and separate from how the composed stack above routes `/api` —
there, the `web` container's nginx proxies it to the `api` service instead;
`proxy.conf.json` plays no part in a production build.

To run the backend against a containerized database instead of a local
Postgres, publish its port for that one session — the composed `db` service
doesn't publish one by default (see Troubleshooting):

    docker compose run --rm -p 5432:5432 db
    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

## Deploy it

`deploy/Dockerfile` builds the whole application as **one image** — the Angular
bundle and the Spring Boot jar together, with nginx in front of both. It needs
nothing but a Postgres connection string and works unchanged on Render, Fly.io,
Railway, App Runner or any container host.

    docker build -f deploy/Dockerfile -t payscope .
    docker run -p 10000:10000 \
      -e PORT=10000 \
      -e DATABASE_URL='postgres://user:password@host:5432/payscope' \
      payscope

`render.yaml` declares that service and a managed Postgres as a Render
blueprint, so the hosted instance is provisioned from this repository rather
than configured by hand. Any other container host works the same way — the
image needs no platform-specific support.

Two variables, both optional in the sense that the platform usually sets them:

| Variable | Meaning |
|---|---|
| `PORT` | The port nginx listens on. Injected by every managed platform; defaults to 8000. |
| `DATABASE_URL` | Standard libpq URL. Split into the three `SPRING_DATASOURCE_*` properties by `deploy/entrypoint.sh`; set those directly instead and they win. |

Schema migration (Flyway) and the 10,000-employee seed both run on boot. Seeding
is idempotent under `pg_advisory_xact_lock`, so a restart, a redeploy or a second
instance cannot double-seed. Budget **30–60 seconds** for a cold start: Flyway,
then the seed, then the first request.

**Why one image, when `docker compose up` runs three services?** Because they
answer different questions. The composed stack is the honest architecture —
separate web, API and database processes, which is how this would actually run.
The single image exists so a reviewer can open a link: free hosting tiers give
you one container and one port, and paying for three services to demonstrate a
salary tool is the wrong trade. The application code is identical; only the
process topology differs, and `deploy/nginx.conf` proxies `/api` to loopback
where `web/nginx.conf` proxies it across the compose network. The SPA calls
`/api` on its own origin either way, so no API host is ever baked into the
bundle and there is no CORS configuration in this project at all.

Verified end to end before publishing: built from a clean context, run against a
throwaway Postgres with a non-default `PORT` and a password supplied only via
`DATABASE_URL`, then checked for a seeded summary, a paged employee list, the
SPA at `/`, and a deep link at `/employees/10001` falling back to `index.html`.

## How this was built

Design preceded code, and the reasoning is committed alongside it.

| Document | What it is |
|---|---|
| [`requirements.md`](requirements.md) | Scope, persona, and what was deliberately left out |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | The design, written and reviewed before implementation |
| [`docs/architecture.md`](docs/architecture.md) | Diagrams: containers, data model, the write path, the analytical path, client state |
| [`docs/adr/`](docs/adr/) | Nine decision records, one decision each, with consequences |
| [`docs/performance.md`](docs/performance.md) | N+1 prevention, SQL aggregation, pagination, write throughput, bundle size |
| [`docs/ai-process.md`](docs/ai-process.md) | How AI tools were used, what the reviews caught, and what the method missed |
| [`docs/ai-prompts.md`](docs/ai-prompts.md) | The prompts and configuration themselves, and the corrections that changed the build |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | The implementation plans, task by task |
| [`docs/superpowers/2026-09-13-frontend-followups.md`](docs/superpowers/2026-09-13-frontend-followups.md) | Everything knowingly not done, with reasoning (backend counterpart alongside) |

Three ADRs were written *during* implementation rather than before it, because
implementation found something the design had not anticipated. Those are the
interesting ones: [0008](docs/adr/0008-accepting-a-double-precision-step-inside-percentile-cont.md)
records a bounded exception to the project's own money rule, and
[0009](docs/adr/0009-zoneless-angular.md) records a decision that could only be
settled by loading the application in a browser - it explains why the unit test
that appeared to prove it proved nothing.

## Test it

    ./mvnw test
    npm test --prefix web

Backend tests run against a real PostgreSQL via Testcontainers, so Docker must
be running. H2 is deliberately not used: the design depends on
`percentile_cont`, partial unique indexes and `SELECT ... FOR SHARE`, none of
which H2 reproduces.

Frontend tests run under Jest, which type-checks the TypeScript it transpiles
but not Angular templates. `npx ng build` (run from `web/`) is the only
command that type-checks templates — a green `npm test` does not guarantee the
app builds; a template-only error has shipped as a build break before.

## API

Money is always a string with an explicit currency: `{"amount":"125000.00","currency":"INR"}`.
Errors are RFC 7807 `application/problem+json`.

### Employees

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/employees` | Paginated. `country`, `department`, `level`, `status`, `q`, `page`, `size` (1-100), `sort`, `direction`. |
| `POST` | `/api/employees` | Creates employee and initial salary together. 201. |
| `GET` | `/api/employees/{id}` | Record, salary, compa-ratio, band, both version tokens. |
| `PUT` | `/api/employees/{id}` | Requires `employeeVersion`. 409 if stale. |
| `POST` | `/api/employees/{id}/deactivate` | Idempotent. |
| `DELETE` | `/api/employees/{id}` | Soft delete. Idempotent, 204. |

### Salary

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/employees/{id}/salary` | Records a raise. Requires `salaryVersion`. 200. |
| `GET` | `/api/employees/{id}/salary-history` | Append-only timeline. |

### Analytics

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/analytics/summary` | Headcount, total cost to company, mean, unbanded count, compa-ratio buckets. |
| `GET` | `/api/analytics/distribution` | `groupBy` (up to two of `DEPARTMENT`, `COUNTRY`, `ROLE`, `LEVEL`). p25/p50/p75/p90, mean, median compa-ratio. |
| `GET` | `/api/analytics/outliers` | Paginated. Compa-ratio below 0.80 or above 1.20. |

## Two things worth knowing

**Cost and fairness are different questions.** Percentiles are in USD and answer
what a group costs. Compa-ratio compares each salary against its own country's
band, so it carries no exchange-rate exposure and is the figure to use when
comparing India with the UK.

**Deleting and deactivating are different.** Deactivation records that someone
left; they still count in payroll history. Deletion says the record should not
exist; it disappears from every figure.

## Troubleshooting

**Testcontainers can't find Docker, or reports the client version is too old.**
Some hosts run a Docker Engine whose minimum supported API version is newer
than the one the bundled Testcontainers client negotiates by default, which
surfaces as "Could not find a valid Docker environment" or a client-version
error. Fix it by pinning the API version Testcontainers uses, in a
machine-level `~/.docker-java.properties`:

    api.version=1.44

Use whatever your host's engine actually reports instead of `1.44`:

    docker version --format '{{.Server.APIVersion}}'

This is deliberately not baked into the build or the repo: hardcoding one
machine's API version would break hosts that negotiate correctly on their own.

**Flyway reports duplicate migrations for the same version.** This happens
after deleting or renaming a migration file — a stale compiled copy is left
behind in `target/classes` and Flyway sees two migrations claiming the same
version. Run `./mvnw clean` to remove it.

**Nothing published on 5432.** The composed `db` service deliberately does not
publish its port to the host — `api` reaches it by service name over the
compose network, and publishing 5432 is the most common reason `docker
compose up` fails outright on a developer machine (`Bind for 0.0.0.0:5432
failed: port is already allocated`), since most already run a Postgres of
their own on it. If you need host access to the containerized database (see
Dev mode above), publish it yourself for that session with
`docker compose run --rm -p 5432:5432 db`, picking a different host-side port
if 5432 is already taken on your machine too.
