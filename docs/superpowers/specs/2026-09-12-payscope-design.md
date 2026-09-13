# Payscope — Design

**Date:** 2026-09-12
**Status:** Approved, pre-implementation
**Supersedes parts of:** `requirements.md` v1 (see §2)

Design for the system described in `requirements.md`. Constraints in `CLAUDE.md`
are assumed throughout and are not restated except where a decision turns on one.

---

## 1. Shape of the system

Spring Boot backend, Angular frontend, PostgreSQL. Package by feature:
`employee/`, `salary/`, `analytics/`, `currency/`, `common/`, `seed/`.

Two user jobs drive every decision. The *operational* job — find an employee,
correct their record — is served by the employee list and detail screens. The
*analytical* job — how does this organization pay people — is served by the
insights screen and a set of SQL aggregates. Aggregation never happens in Java.

---

## 2. Amendments to `requirements.md`

Three decisions here contradict v1 of the requirements. They are recorded rather
than silently applied.

**2.1 Pay bands are per (role, level, country), not per (role, level).**
`requirements.md` §5 states midpoints are seeded per role and level. Measured
that way, compa-ratio stops detecting pay problems and starts detecting
geography: every employee in a lower-cost country falls below 80% and the
outlier list becomes noise. Bands are therefore keyed on country as well and
held in that country's local currency. See ADR-0002.

**2.2 Concurrent-edit semantics are in scope.**
`requirements.md` §5 assumes a single user and "no concurrent-edit or locking
semantics beyond ordinary transactions". Optimistic locking is now a
requirement. See ADR-0007.

**2.3 Soft delete exists and is distinct from deactivation.**
v1 has only `deactivate`. A separate record-level delete is added, deliberately
kept apart from employment status. See ADR-0005.

---

## 3. Data model

Six tables. The owning feature package is given in brackets.

### `country` *(currency/)*
`country_code` (ISO-3166 alpha-2) PK, `name`, `currency_code`.
Reference data. Maps an employee's country to the currency their salary is
denominated in — a real relation, not an enum.

### `employee` *(employee/)*
`id`, `employee_number` (unique, human-facing), `full_name`, `email`,
`department`, `country_code` → `country`, `role`, `level`, `employment_type`,
`hire_date`, `status`, `deleted_at`, `version`, `created_at`, `updated_at`.

`department` / `role` / `level` / `employment_type` / `status` are Java enums
persisted as `VARCHAR` with Flyway `CHECK` constraints — integrity without five
lookup tables.

### `salary` *(salary/)*
The current salary. `UNIQUE(employee_id)`.
`amount_original NUMERIC(19,4)`, `currency_code`, `amount_base_usd NUMERIC(19,4)`,
`fx_rate NUMERIC(18,8)`, `fx_rate_date`, `effective_from`, `version`.

The rate used for conversion is copied onto the row, so `amount_base_usd` stays
reproducible even if `fx_rate` is later amended.

### `salary_history` *(salary/)*
Append-only. The same money columns plus `effective_to` and `change_reason`.
History rows retain their own frozen `fx_rate`; converted amounts are never
recomputed.

### `fx_rate` *(currency/)*
`(currency_code, rate_date)` PK, `rate_to_usd NUMERIC(18,8)`. Seeded, dated,
fixed. No live feed (`requirements.md` §4).

### `pay_band` *(salary/)*
`UNIQUE(role, level, country_code)`, plus `currency_code` and `min` / `mid` /
`max` in that country's local currency.

### Money handling
A `Money` `@Embeddable` (`BigDecimal` + `Currency`) in `common/`. Amounts round
half-up to the currency's own minor units on write — JPY has none, so this is
correctness, not cosmetics. `amount_base_usd` rounds to 2dp.

### Indexes
- Composite on `employee(status, country_code, department, level)` for list filters.
- `UNIQUE(email) WHERE deleted_at IS NULL` — partial. Without this, a deleted
  person's email is permanently burned and re-creating them fails.
- `UNIQUE(employee_number) WHERE deleted_at IS NULL` — same reasoning.
- Search runs as plain `ILIKE` initially. A `pg_trgm` index is a change to be
  justified by a measurement, not a guess; at 10k rows `ILIKE` is expected to
  clear the 200ms bar unaided.

### Known cost of the current/history split
Two writes must agree. The raise is a single `@Transactional` service method
with the history insert derived from the row being replaced, covered by an
integration test asserting history is written — and asserting nothing is written
when the transaction fails partway.

---

## 4. N+1 prevention

The employee list is the hot path: 100 rows, each wanting salary, the country's
currency, and a pay band for the compa-ratio badge. Naively mapped, that is one
query plus three hundred.

1. **Read models are projections, not entity graphs.** The list endpoint loads no
   `Employee` entities. One projection query joins `employee` to `salary`,
   `country` and `pay_band` and returns a flat row DTO; one count query follows.
   Two statements per page, constant in page size. Entities are for writes and
   the detail view.
2. **No inverse `@OneToOne` on `Employee`.** `Salary` owns the FK and maps
   `@ManyToOne(fetch = LAZY)`. `Employee` has no back-reference. A non-owning
   `@OneToOne` marked `LAZY` still fires a query on every access, because
   Hibernate must determine whether to return null — the fix is not to map it.
3. **`spring.jpa.open-in-view=false`.** Otherwise lazy loads fire during JSON
   serialization, outside the service boundary, where nothing looks for them.
4. **`hibernate.default_batch_fetch_size=100`** plus `@BatchSize` on
   `salary_history`, as a net. Anything that slips through degrades to N/100.

**Never `JOIN FETCH` a collection on a paginated query.** Hibernate pulls every
row into memory and paginates in Java — a performance cliff and a direct breach
of the server-side pagination rule. Collection fetches only on single-entity reads.

**Proven, not asserted.** Integration tests wrap each hot path in Hibernate's
`Statistics` and assert an exact statement count, run at page size 10 and again
at 100 so independence from row count is demonstrated rather than claimed.
`Statistics` ships inside Hibernate — no new dependency.

Analytics is immune by construction: aggregate SQL, one statement per endpoint.

---

## 5. Soft delete

`status` and `deleted_at` are different facts and are not merged.

- `status` (ACTIVE / INACTIVE) — *this person left the company*. A business
  truth that remains analytically meaningful; last year's payroll legitimately
  includes leavers.
- `deleted_at` — *this record should not exist*. A data-entry correction.

Merging them makes "we have 400 leavers" indistinguishable from "someone
fat-fingered 400 records".

Deleted rows are invisible in the list, 404 on detail, and excluded from every
analytics aggregate. Inactive rows remain visible and filterable.

**`deleted_at` lives only on `employee`.** Therefore **no aggregate may query
`salary` without joining `employee`** — a `salary`-only sum would silently
include deleted people in total payroll.

Hibernate's `@SQLRestriction` covers entity loads but **does not apply to native
queries**, which is what the list projection and every analytics aggregate are.
The predicate is written explicitly in those queries. Four visible repetitions
beat one annotation that silently misses the queries that matter.

---

## 6. Pagination

`GET /api/employees?page=0&size=25&sort=FULL_NAME&direction=asc` plus filters.

*(Amended after implementation: this section originally documented Spring's
`sort=fullName,asc` form. The built API takes the sort key and the direction as
separate parameters, with the key drawn from a closed enum. The README and the
frontend plan both describe the implemented shape; this text was the stale one.)*

- **`size` outside 1–100 → 400**, not a silent clamp. A client asking for 500
  has a bug; quietly returning 100 hides it.
- **`sort` is a closed whitelist** → 400 otherwise. Mandatory: the list runs as
  a native projection query, so an unvalidated sort field is an injection vector.
- **Default sort `fullName ASC, id ASC`.** The `id` tiebreaker is required for
  correctness, not neatness — without a unique final key, rows sharing a sort
  value can appear on two pages or be skipped entirely while paging.
- **Response is a project-owned DTO** (`content`, `page`, `size`,
  `totalElements`, `totalPages`), not a serialized Spring `PageImpl`, whose
  shape Spring Data itself declines to treat as a stable contract.
- Offset paging is correct at this scale. Keyset is the answer at millions of
  rows and is not built now.

---

## 7. Concurrency and idempotency

### Optimistic locking
`@Version` on `Employee` and on `Salary`. Exposed as **`employeeVersion`** and
**`salaryVersion`** — never a single ambiguous `version` field, since the two
guard different operations and a client sending the wrong one would either fail
confusingly or, worse, succeed.

A 409 carries the current version in the problem detail, so the client can
recover without a second round trip.

Optimistic, not pessimistic: `SELECT … FOR UPDATE` would serialize writers and
invite deadlocks in an application whose real contention is near zero.

### Where versions are required
| Operation | Version required | Why |
|---|---|---|
| `PUT /employees/{id}` | `employeeVersion` | Read-modify-write on fields |
| `POST /employees/{id}/salary` | `salaryVersion` | Read-modify-write plus history |
| `DELETE /employees/{id}` | **No** | See below |
| `POST /employees/{id}/deactivate` | **No** | See below |

Delete and deactivate are transitions to a *fixed target state*, not
read-modify-write. There is no lost update to prevent. Requiring a version would
also make them non-idempotent — the first call bumps the version, so a retry
would 409, contradicting §7's idempotency guarantees.

### Idempotency
- `GET` / `PUT` naturally idempotent.
- **`DELETE` on an already-deleted employee → 204**, not 404. A retry reaching
  the same end state must report success; a retry that reports failure for work
  that already succeeded is how double-submits get invented.
- **Deactivate on an already-inactive employee → 200**, no-op.
- **The raise is protected for free.** A double-submit replays the same
  `salaryVersion`; the first wins and bumps it, the second gets 409. The
  optimistic-lock token doubles as an idempotency key, covering the case that
  actually matters — applying a raise twice.
- **Create is guarded by the partial unique index on email.** A retry gets 409
  rather than a duplicate person. Accepted limitation: a retried create reads as
  a validation failure. No `Idempotency-Key` table is built (ADR-0007).
- **Duplicate detection is never a pre-check.** `SELECT`-then-`INSERT` is
  check-then-act and loses under concurrency. The partial unique index is the
  source of truth; `DataIntegrityViolationException` maps to 409.

### Two remaining races, both closed
- **Seeding.** A `pg_advisory_lock` plus a row-count check, so two concurrent
  starts cannot double-seed.
- **Delete racing a raise.** These do not naturally contend — delete updates
  `employee`, the raise updates `salary`; different rows, different version
  columns. A raise can therefore land on an employee deleted microseconds
  earlier. The raise transaction takes `SELECT … FOR SHARE` on the employee row,
  blocking the delete until it commits. The one place pessimistic locking earns
  its keep, and cheap because contention is effectively zero.

---

## 8. API contract

All paths under `/api`. Errors are RFC 7807 `application/problem+json` via
Spring Boot's built-in `ProblemDetail`. No new dependency.

### Employees
| Method | Path | Notes |
|---|---|---|
| `GET` | `/employees` | Paginated. Filters `country`, `department`, `level`, `status`, `q`. |
| `GET` | `/employees/{id}` | Employee + current salary + compa-ratio + matched band + both versions. |
| `POST` | `/employees` | Creates employee **and** initial salary in one transaction. |
| `PUT` | `/employees/{id}` | Employee fields only. Requires `employeeVersion`. |
| `POST` | `/employees/{id}/deactivate` | Sets `status = INACTIVE`. |
| `DELETE` | `/employees/{id}` | Soft delete. |

Create includes the initial salary because no meaningful state exists in which
an employee has no pay; permitting it would force a null branch into every
analytics query forever. Deactivate is a named endpoint rather than a `PATCH`
that happens to set a field, because it is a business action and reads as one.

### Salary
| Method | Path | Notes |
|---|---|---|
| `POST` | `/employees/{id}/salary` | Records a raise. Archives current to history, inserts new. Requires `salaryVersion`. |
| `GET` | `/employees/{id}/salary-history` | Append-only timeline. |

History is a separate call, fetched by the detail screen only when the timeline
tab opens.

### Analytics
| Method | Path | Returns |
|---|---|---|
| `GET` | `/analytics/summary` | `headcount`, `totalCostToCompanyUsd`, `meanBaseUsd`, `unbandedCount`, `compaRatioBuckets` |
| `GET` | `/analytics/distribution` | Per group: `headcount`, `p25`, `p50`, `p75`, `p90`, `mean` (USD), `medianCompaRatio` |
| `GET` | `/analytics/outliers` | Paginated. Compa-ratio < 0.80 or > 1.20. |

All three take the same four filters. `distribution` additionally takes
`groupBy` — an ordered list drawn from `{department, country, role, level}`,
**capped at two dimensions** (400 beyond that). Four dimensions would produce a
cartesian product no reader can use.

`compaRatioBuckets` are counts per band (`<80`, `80–90`, `90–110`, `110–120`,
`>120`), computed by a `CASE` aggregate in SQL.

### Status codes
| Code | When |
|---|---|
| `200` | GET, PUT, deactivate, **and the salary raise** |
| `201` | `POST /employees` only, with `Location` |
| `204` | `DELETE` |
| `400` | Validation failure, bad enum/sort/groupBy value, `size` out of range, domain rule violation |
| `404` | Not found **or** soft-deleted — the two must be indistinguishable |
| `409` | Stale version, duplicate email / employee number |
| `500` | `ProblemDetail` only, never a stack trace |

The raise returns **200, not 201**: `/employees/{id}/salary` is a singleton that
was replaced. The history row it produces is not separately addressable, so a
`Location` header would be fiction. No `422` anywhere — one code for "your input
is wrong" is worth more than the pedantic split.

### Validation — four layers, each with a distinct job
1. **Bean Validation on request DTOs** — `@NotBlank`, `@Email`, `@Positive`,
   `@PastOrPresent`. A `@RestControllerAdvice` produces a 400 carrying
   `errors: [{field, message}]` so the form can highlight fields.
2. **Query-parameter validation.** Spring's default response to an unparseable
   enum in a query param is a **500**. Every enum-valued param (`country`,
   `level`, `department`, `status`, `groupBy`, `sort`) gets an explicit converter
   failing to a 400 that **lists the permitted values**.
3. **Domain invariants, in the domain object** — amount strictly positive;
   currency must equal the employee's country currency (an INR salary on a UK
   employee is nonsense the schema cannot catch); `effectiveFrom` not before hire
   date and not in the future; `groupBy` ≤ 2 dimensions.
4. **Database constraints** — `CHECK`, partial `UNIQUE`, `FK`, `NOT NULL`.

Layers 1–3 produce good messages. **Layer 4 is the only one that holds under
concurrency.** They do different jobs; none is redundant.

### Money on the wire
`{"amount": "125000.00", "currency": "INR"}` — a **string**, never a JSON
number. A `BigDecimal` emitted as a JSON number is parsed into a JavaScript
double on arrival, which is the `double`-for-money failure `CLAUDE.md` forbids,
merely relocated to the browser.

### Unbanded employees are surfaced, never dropped
Where a `(role, level, country)` combination has no seeded band, compa-ratio is
`null`. That employee still counts in headcount and payroll totals but is
excluded from compa-ratio math, and `summary.unbandedCount` reports how many.
Dropping them silently would make the outlier list quietly incomplete — worse
than useless for the persona.

---

## 9. Analytics query shape

Percentiles use `percentile_cont` (ADR-0003) and run on `amount_base_usd`,
because a group may span currencies. `medianCompaRatio` uses the same function,
so one payload never carries two percentile methods.

**Two figures, two questions.** USD percentiles answer *cost*. Compa-ratio
answers *fairness* — it is a ratio of local salary to local band midpoint, so it
is dimensionless, free of FX entirely, and comparable across countries. Neither
is authoritative for the other's question, and the UI labels them accordingly.

Every aggregate joins `employee` and filters `deleted_at IS NULL` (§5).

---

## 10. Frontend

Three lazy-loaded standalone feature routes; `/employees` is the default.

### State
Signal-based store service per feature. `EmployeeListStore` holds `filters`,
`page`, `sort` as signals; a `computed` derives the query; an `effect` issues the
request. Components are `OnPush` and read signals directly.

RxJS appears only at the HTTP boundary, where `debounceTime(300)` + `switchMap`
do real work. **That `switchMap` is the frontend's race condition:** typing
"John" quickly can let the response for "Jo" resolve *after* the response for
"John", repainting the table with results for a query the user has left.
`switchMap` cancels the in-flight request per keystroke so the last request is
always the one that renders.

### URL is the source of truth for list state
Filters, page and sort sync to query params. Refresh keeps its place, the back
button behaves, and a filtered view is shareable.

### Screens
- **`/employees`** — Material table, server-side paginator bound to
  `totalElements`, sort restricted to whitelisted fields, filter chips, debounced
  search. Rows show salary in original currency and USD, plus a compa-ratio badge.
- **`/employees/:id`** — two tabs. *Details* (record + edit form). *Salary
  history* (lazily fetched on first open). The compa-ratio badge sits beside the
  band's min/mid/max, so the number is explained where it is shown.
- **`/insights`** — summary tiles (headcount, total CTC USD, unbanded count); a
  `groupBy` control capped at two dimensions; two charts; the paginated outlier
  table.

**The filter bar is one shared component** used by both list and insights.

### Charts
No box plot. The persona is explicitly non-technical, and a chart requiring the
reader to know what a whisker means is worse than a table.

1. **Horizontal bar — median pay by group.** Answers "India vs UK" at a glance.
   Exact p25/p50/p75/p90 sit in the table beneath, so precision is available
   without putting spread into the picture.
2. **Vertical bar — headcount by compa-ratio band.** A histogram, legible
   without training. The two edge bars *are* the answer to "is anyone badly out
   of band?"; clicking one filters the outlier table below.

Both consume precomputed scalars in ngx-charts' native `{name, value}` format.
No client-side statistics — see ADR-0006.

### Errors, money, states
An HTTP interceptor parses `ProblemDetail` into a typed error; field-level
`errors[]` bind back to form controls, everything else raises a snackbar.

**A 409 on save is never silently retried** — it surfaces "this record changed
since you opened it" with a reload action. Silently retrying an optimistic-lock
failure re-creates precisely the lost update the version exists to prevent.

Money arrives as strings and stays strings, formatted by a `MoneyPipe` via
`Intl.NumberFormat`. **No arithmetic occurs in the browser**; every aggregate is
already computed in SQL.

Every screen renders **loading, empty and error** as distinct states. "No
employees match these filters" and "we couldn't reach the server" are different
messages.

### Change detection
Signal-based stores work with or without zone.js. Zoneless is a spike during
scaffolding, not a decision made here — see §13.

---

## 11. Seeding

**Reference data ships as Flyway migrations**: `country`, `fx_rate`, `pay_band`
are small, schema-adjacent, and every query depends on them. **The 10,000
employees do not** — they are runtime seed data produced by a `SeedRunner` in
`seed/`, gated on `payscope.seed.enabled` (on for dev and docker-compose, off in
tests, which build their own fixtures). Migrations run before the seeder, so
rates and bands are present when salaries are written.

**"Seconds, not minutes"** comes from two things:
- `JdbcTemplate.batchUpdate` in batches of 1000, not JPA `saveAll` — the latter
  is 10,000 individual inserts dragging a persistence context behind them.
- `reWriteBatchedInserts=true` on the JDBC URL, letting the driver collapse a
  batch into multi-row `INSERT`s. A connection-string flag, and the larger lever
  of the two.

**Idempotent and reproducible.** `pg_advisory_lock` plus a row-count check.
`Random` is constructed with a fixed seed, so the same 10,000 people appear every
run — required by `CLAUDE.md`, and it makes analytics figures hand-checkable
against a known population.

**The distribution is shaped deliberately**: a level pyramid with more juniors
than principals, salaries drawn around each band midpoint with realistic spread,
and **~4% placed outside the 80–120% window on purpose** — an outlier detector
with no outliers demos as broken. A slice of employees receives one to three
historical raises so timelines are not empty.

---

## 12. Test strategy

| Layer | Covers | Why it exists |
|---|---|---|
| Domain units, no Spring | `Money` rounding per currency, compa-ratio, band matching, invariants | Fast; where the math lives |
| **Analytics math** | p25/p50/p75/p90 asserted **exactly** against a hand-built ~12-employee fixture | The math is the point |
| Repository / integration | Testcontainers Postgres | See below |
| Query counts | Hibernate `Statistics`, exact counts | N+1 regression guard (§4) |
| Concurrency | Two detached copies, no threads | Deterministic 409 reproduction |
| Web layer | `@WebMvcTest` — status codes, 400 shapes, enum-param 400s, 409 bodies | §8 asserted, not assumed |
| Frontend | Jest + Angular Material component harnesses | §10 |

**Testcontainers over H2 is concrete here, not dogma.** This design depends on
`percentile_cont`, partial unique indexes and `SELECT … FOR SHARE`. H2
reproduces none of them faithfully; a suite passing on H2 would say nothing
about whether the system works. One container is shared across the suite via
`@ServiceConnection` and a singleton, migrated once, with rollback between tests.

**The analytics fixture deliberately includes an even-sized group**, pinning
`percentile_cont`'s interpolation by test rather than assumption, **and a
mixed-currency group**, proving aggregation runs on `amount_base_usd`.

**A `Clock` bean is injected everywhere** — never `LocalDate.now()` in a service.
"Hire date not in the future" and `effectiveFrom` validation are otherwise
untestable without wall-clock dependence, which `CLAUDE.md` bans. Tests inject
`Clock.fixed`.

**Concurrency tests use no threads.** Optimistic locking is tested by loading two
detached copies of an entity, saving the first, then saving the second and
asserting `OptimisticLockingFailureException` — the exact interleaving, every
run, with no scheduler dependence.

---

## 13. Decision records

| ADR | Decision |
|---|---|
| 0001 | USD base currency; conversion at write time; rate frozen on the row |
| 0002 | Pay bands per (role, level, country) in local currency — supersedes `requirements.md` §5 |
| 0003 | `percentile_cont` for all percentiles, including compa-ratio |
| 0004 | Current salary table + separate append-only history |
| 0005 | Soft delete distinct from employment status; every salary aggregate joins `employee` |
| 0006 | ngx-charts, fed only precomputed aggregates — no client-side statistics |
| 0007 | Optimistic locking as concurrency *and* idempotency mechanism; no `Idempotency-Key` table |
| 0008 | Accepting a double-precision step inside `percentile_cont` — written during implementation |

**Seven of those eight** were checked pairwise for contradiction before being
written. Four conflicts were found and resolved into the design above: `DELETE`
versioning vs idempotency (§7), ambiguous `version` naming (§7), the band
reference line on a USD chart (§10), and ngx-charts' client-side quartile
computation (§10).

ADR-0008 is the exception: it was written during implementation, when
`percentile_cont` turned out to entail a floating-point step the design had not
anticipated. It postdates that check rather than forming part of it.

**Zoneless Angular is not an ADR, and no longer holds a reserved number.**
This section originally earmarked ADR-0008 for it, which was itself the mistake
— a number should not be reserved for a decision nobody has made yet, and
implementation reached a different one first and took it. Zoneless could not be
verified against ngx-charts from available documentation, and an ADR resting on
an unverified claim is how the contradictions above get created. It becomes a
short spike during scaffolding and earns **ADR-0009** only if evidence supports
it. Nothing in this design depends on the outcome.

---

## 14. Success criteria traceability

| `requirements.md` §6 criterion | Where met |
|---|---|
| 10,000 employees seed in seconds | §11 — batched JDBC + `reWriteBatchedInserts` |
| Any page returns under 200ms, filtered and sorted in the database | §4 projection query, §6, index plan in §3 |
| Every org-wide figure in one currency and explicable | §3 `amount_base_usd`, §9 cost-vs-fairness split |
| Insights answer ≥3 real HR questions, math asserted against known values | §8 three endpoints, §12 exact-value fixture |
| Clone and run in under five minutes | §11 seeding on by default under docker-compose |
