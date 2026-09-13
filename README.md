# Payscope

Salary management and pay insights for an HR team operating across several
countries. See `requirements.md` for scope and `docs/superpowers/specs/` for the
design.

## Run it

    docker compose up

The API comes up on http://localhost:8080 with 10,000 seeded employees. First
build takes a few minutes; subsequent starts are seconds.

To run against a local database instead:

    docker compose up db
    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

## Test it

    ./mvnw test

Tests run against a real PostgreSQL via Testcontainers, so Docker must be
running. H2 is deliberately not used: the design depends on `percentile_cont`,
partial unique indexes and `SELECT ... FOR SHARE`, none of which H2 reproduces.

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
