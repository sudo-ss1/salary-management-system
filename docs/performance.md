# Performance considerations

The brief's scale figure — 10,000 employees across six countries — is small for a database and
large for a naive ORM. Almost every decision below is about keeping work in the database and off
the round trip, and each is guarded by a test rather than an intention.

Measured figures are from this repository, not estimates.

---

## The N+1 problem, and how it is actually prevented

An employee row on the list screen carries the person, their current salary, their converted USD
amount and their compa-ratio against a pay band — four tables. The obvious JPA implementation
issues one query for the page and then one more per row, so a page of 100 costs 101 queries and
gets slower as the page grows.

**Prevented by a projection query**: the list is read through a single native statement that joins
what it needs and returns a flat row, plus one count query for the paginator.

**Guarded by counting statements, not by inspecting results.** `QueryCounter` reads Hibernate's
`Statistics.getPrepareStatementCount()` around a call:

| Assertion | Statements |
|---|---|
| A page of 10 employees | exactly **2** |
| A page of **100** employees | exactly **2** — *the same two* |
| Whole analytics summary | exactly **1** |
| Distribution across every group | exactly **1** |

The middle row is the one that matters: **independence from page size is the property**, and only
a statement count proves it. The test file says so in its own comment — a version that lazily
loaded salary once per row would still return fully populated rows and pass any assertion that
merely checked the fields were non-null.

Supporting choices: `open-in-view: false`, so no query can escape into template rendering; no
inverse `@OneToOne` from employee to salary, which is the mapping that most often reintroduces
this; `default_batch_fetch_size: 100` for the paths that do traverse associations.

---

## Aggregation happens in SQL

Every percentile, mean, count and bucket is computed by PostgreSQL and arrives precomputed
([ADR-0006](adr/0006-ngx-charts-fed-precomputed-aggregates.md)). The client performs **no**
statistical work — verified across the whole insights feature by grepping for sorting, averaging,
summing and `Math.`, which returns nothing.

This matters beyond tidiness: transferring 10,000 salary rows to compute a median in JavaScript
would be roughly three orders of magnitude more data over the wire than transferring the median,
and it would be wrong — floating-point summation over a large set of decimal amounts loses
precision that `numeric` does not.

Percentiles use `percentile_cont`, which PostgreSQL defines only over `double precision`. That is
a deliberate, bounded exception with its error analysis recorded
([ADR-0008](adr/0008-accepting-a-double-precision-step-inside-percentile-cont.md)).

---

## Pagination is server-side, always

`MAX_SIZE = 100`, and a larger request is **rejected with 400 rather than silently clamped** — a
clamped request lies to the caller about what it received.

The paginator's total always comes from the server's count query against the same predicate as
the page. This is why the outlier band filter is a parameter on `GET /api/analytics/outliers` rather
than a filter applied in the browser: filtering a returned page would have filtered *one page*
rather than the set, and the paginator would have reported a total that did not match the rows on
screen. Verified live — `band=LT_80` returns `totalElements: 191` and `band=GT_120` returns 199,
matching the summary's histogram buckets exactly.

Sorting uses a closed enum, never request text interpolated into SQL, with a mandatory `e.id asc`
tiebreaker so pages cannot overlap or skip rows under equal sort keys.

Indexes backing these paths:

```
employee_list_filter          -- the filter combination the list screen uses
employee_default_sort         -- the default ordering
pay_band_lookup               (job_role, job_level, country_code)
salary_base_amount            (amount_base_usd)      -- percentile ordering
salary_history_by_employee    (employee_id, effective_to desc)
employee_email_unique         partial: WHERE deleted_at IS NULL
employee_number_unique        partial: WHERE deleted_at IS NULL
```

The two unique indexes are partial so a soft-deleted employee's email can be reused
([ADR-0005](adr/0005-soft-delete-distinct-from-employment-status.md)).

---

## Write throughput

**10,000 employees, each with a salary, seeded in 1,288 ms** (measured; the application logs it).

That comes from batched JDBC with `reWriteBatchedInserts=true` on the connection URL, which lets
the PostgreSQL driver rewrite many single-row inserts into multi-row statements, and
`hibernate.jdbc.batch_size: 1000`. Row-at-a-time inserts for the same data take minutes.

Seeding is idempotent under `pg_advisory_xact_lock`, so a restart or a second instance cannot
double-seed.

---

## Currency conversion is done once, at write time

`amount_base_usd` is stored on the row with the FX rate frozen alongside it
([ADR-0001](adr/0001-usd-base-currency-converted-at-write-time.md)). Analytics therefore aggregate
a plain `numeric` column — no per-row conversion, no join to a rate table, no dependence on rate
history at read time.

The alternative (convert on read) would put a lookup and a multiplication inside every aggregate
over every row, and would silently change historical figures whenever rates moved.

---

## Client-side

| | |
|---|---|
| Initial bundle | **379 kB raw, 97.7 kB transferred** |
| zone.js | **absent** from the production bundle |
| Feature routes | three lazy chunks |

Routes are lazy, verified at the bundler rather than only in the route table: the insights bundle
and its chart library never load for someone who came to correct one record.

Running **zoneless** removes zone.js's monkey-patching of every async browser API and its
whole-tree change detection; signals tell Angular precisely what changed. Verified by rendering,
with its costs recorded ([ADR-0009](adr/0009-zoneless-angular.md)).

Searching is debounced at 300 ms and **superseded requests are cancelled**, not merely ignored —
`switchMap` at the HTTP boundary. Without it a slow response for an abandoned query can resolve
last and repaint the table with results the user has already moved past. Four such races were
found and closed during the build; the cancellation test is proven by swapping `switchMap` for
`mergeMap` and watching it fail.

---

## What was deliberately not optimised

- **No caching layer.** At this scale the queries are indexed and fast; a cache would add an
  invalidation problem to a system whose correctness story is its main asset.
- **No read replica or CQRS split.** One database serves both paths comfortably here.
- **No virtual scrolling.** Server-side pagination at 25–100 rows keeps the DOM small already.
- **Charts are a fixed pixel size** rather than responsive — recorded as a follow-up, not claimed
  as finished.
