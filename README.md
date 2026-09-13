# Payscope

Salary management and pay insights for an HR team operating across several
countries. See `requirements.md` for scope and `docs/superpowers/specs/` for the
design.

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
