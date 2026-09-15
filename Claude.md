# CLAUDE.md

Guidance for agents working in this repository. Read this before making changes.

## What this is

**Payscope** — salary management and pay insights for HR teams operating across
multiple countries.

Built for the HR Manager of a ~10,000-employee organization. Two jobs: maintain
employee salary records, and answer questions about how the org pays people
across departments, countries, roles and levels.

Scope decisions and deliberate exclusions live in `requirements.md`. Read it
before proposing features. Do not build anything listed there as out of scope.

## Stack

- Java 21, Spring Boot 3.x, Spring Data JPA, Flyway
- PostgreSQL (production and tests, via Testcontainers)
- Angular 20, standalone components, signals, Angular Material
- JUnit 5, AssertJ, Mockito, Testcontainers; Jest for the frontend

## Commands

    ./mvnw test                  # backend tests
    ./mvnw spring-boot:run       # backend, port 8080
    npm test --prefix web        # frontend tests
    npm start --prefix web       # frontend, port 4200
    docker compose up            # full stack + database

Run the relevant test command before declaring any change complete.

## Workflow

This project is built test-first. For every behaviour change:

1. Write a failing test that names the behaviour. Run it. Confirm it fails for
   the right reason.
2. Write the minimum code to make it pass. Run the test.
3. Refactor with the test green.

If asked to implement something without a test, write the test first and say so.

## Git

**Push to `origin` is permitted** — changed 2026-09-15; this file previously
forbade pushing outright, and the work is now published to GitHub. Conditions:

- **Authenticate over SSH**, never with the PAT. See Credentials below: the
  token stays out of this entirely, which is the whole point of using a key.
- Adding or changing `origin` is fine. Point it only at the author's own
  repository.
- **Never force-push a branch that has already been pushed**, with `--force` or
  `--force-with-lease`. Published history is not rewritten.
- Push feature branches as well as `master`. The branch structure is part of
  how this work reads; flattening it to one branch loses that.

**One feature per commit. Never batch features together.** A commit that
delivers two unrelated things must be split. Within a single feature, the TDD
steps get their own commits — the failing test, the implementation that makes it
pass, and any refactor are three commits, not one. More, smaller commits is the
correct direction; fewer, larger is not.

**No AI attribution in commit messages.** Do not add `Co-authored-by: Claude`,
`Generated with Claude Code`, or any similar trailer, footer or emoji. Commit
messages describe the change and nothing else.

Conventional prefixes: `feat:`, `test:`, `refactor:`, `fix:`, `perf:`, `docs:`,
`chore:`, `ci:`.

## Credentials

`.env` holds `GITHUB_PAT`, `GITHUB_USERNAME` and `GITHUB_USEREMAIL`.

- `.env` must be listed in `.gitignore` before the first commit. Verify this.
- Never read, print, echo, log or commit the contents of `.env`.
- Never embed the token in a remote URL, a config file, a script or a commit.
- Keep a `.env.example` with the keys and empty values; commit that instead.

If a task appears to need the token, stop and say so rather than using it.
Pushing does not need it: an SSH key authenticates without a token, and a PAT
embedded in a remote URL is written to `.git/config` in plaintext, which is the
most common way these leak.

## Architecture rules

- Package by feature, not by layer: `employee/`, `salary/`, `analytics/`,
  `currency/`, `common/`, `seed/`. A feature's controller, service, repository
  and entity live together.
- Controllers stay thin. Business logic lives in services and domain objects.
- Schema changes go through a new Flyway migration. Never edit an applied one.

## Domain rules

Non-negotiable. Raise a conflict rather than working around one.

- **Money is `BigDecimal`, never `double` or `float`.** Amounts move through the
  `Money` value object with an explicit currency.
- **Never aggregate across mixed currencies.** Every salary carries
  `amount_original` (+ `currency_code`) and `amount_base` in USD. Org-wide
  aggregation runs on `amount_base`.
- **Aggregation happens in SQL, not in Java.** Medians, percentiles, totals and
  group statistics are database queries. Do not load rows into memory to compute
  them.
- **Pagination, filtering and sorting are server-side.** The frontend never
  receives the full employee set. Page size caps at 100; every paginated query
  has an explicit default sort.

## Testing rules

- Fast and deterministic. No `Thread.sleep`, no wall-clock dependence, no random
  data without a fixed seed, no network calls.
- Test names describe behaviour, not method names.
- Analytics tests assert exact expected values against a fixed, known dataset.
  The math is the point; do not assert only that a result is non-null.
- Repository and integration tests use Testcontainers, not an in-memory database
  that behaves differently from Postgres.

## Frontend rules

- Standalone components. Feature routes lazy-loaded.
- State lives in signal-based services. RxJS is for HTTP orchestration only.
- No state management library. If you believe one is needed, raise it first.

## Conventions

- Architecture decisions are recorded in `docs/adr/` in Nygard format. ADRs are
  append-only; supersede rather than edit.

## Do not

- Push to any remote.
- Add dependencies without asking. Justify any new library against what the
  stack already does.
- Generate large amounts of code in one pass. Work in increments that map to
  single commits.
- Write speculative abstractions, interfaces with a single implementation, or
  configuration for requirements that do not exist yet.
- Silently expand scope. If a request implies something outside
  `requirements.md`, say so before building it.