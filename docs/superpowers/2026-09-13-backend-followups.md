# Payscope backend — known follow-ups

Everything here was raised by a reviewer during the build, judged against the
spec, and consciously not fixed. Nothing in this list blocks merge; the branch
ships with 156 tests passing and no Critical or Important findings open.

Recorded so these are decisions rather than things nobody noticed.

## Worth doing when the file is next open

**`GroupByDimension.parse` counts duplicates against the two-dimension cap.**
The size check runs before `.distinct()`, so `?groupBy=COUNTRY&groupBy=COUNTRY&groupBy=LEVEL`
is a 400 "was given 3" even though it resolves to two distinct dimensions. The
comment at `DistributionApiTest` claims otherwise and is wrong. Decide which
behaviour is wanted — moving `.distinct()` above the size check makes the comment
true — then fix the comment either way.

**`GroupByDimension.parse` has no unit test for deduplication.** It is a pure
static function; `parse(List.of("COUNTRY", "COUNTRY"))` returning one element
discriminates the fix in one line. The existing endpoint test is a
characterisation test, not a regression test — the duplicate column was
invisible at the HTTP layer.

**Three seeder guards check less than their names imply.**
- The history guard checks each interval is within employment and non-inverted,
  but not that intervals are contiguous and non-overlapping. A regression that
  failed to advance the period end would produce fully overlapping intervals
  that each pass individually.
- The unbanded-pay guard asserts a principal out-earns a senior, which a wildly
  overshooting fallback would also satisfy. Asserting the derived figure for one
  known role and country would close it.
- The raised-since-joining check passes if a single employee in 500 has a raise.

**The id-tiebreaker test is index-dependent.** It discriminates on a `DEPARTMENT`
sort but not on `FULL_NAME`, because `employee_default_sort on (full_name, id)`
already returns id-ordered rows for that column. If an index over
`(department, id)` is ever added, this test will silently stop discriminating
while continuing to pass. Inherent to testing a SQL ordering property over HTTP.

## Deliberate, documented, and fine as they are

- **`employee.updated_at` is never written.** It will always equal `created_at`.
  Either maintain it with `@UpdateTimestamp` or drop the column — but nothing
  reads it today.
- **`pay_band_lookup` duplicates the index behind `pay_band_unique`** — same
  three columns, same order. Droppable in a new migration.
- **`pay_band` has no CHECK constraints** on `job_role`/`job_level`, while
  `employee` has five. A typo in a future band migration would land silently.
- **Four Spring test contexts start four PostgreSQL containers.** Moving
  `@Import(FixedClockConfig.class)` into the `@IntegrationTest` meta-annotation
  would collapse them toward one and close a related gap: six test classes
  currently run on `Clock.systemUTC()` rather than the fixed clock. None asserts
  anything date-dependent today.
- **`toUpperCase()`/`toLowerCase()` without a `Locale`** in `EmployeeSort`,
  `GroupByDimension` and `EmployeeGenerator`. Under a Turkish default locale
  `sort=hire_date` would 400, and the seeder's "deterministic" population is
  deterministic per locale rather than absolutely. `Locale.ROOT` fixes all three.
- **ILIKE wildcards in the search parameter are not escaped**, so `q=%` matches
  everyone. It is a bound parameter, so this is surprising behaviour rather than
  a vulnerability.
- **The container runs as root.** No `USER` directive in the Dockerfile.
- **Five of seven whitelisted sort columns are never exercised by a test.**
  `COMPA_RATIO` is the one worth adding: it orders by a select-list alias rather
  than a column, and sorting by it descending leads with unbanded employees.
- **Seeding begins after the port opens**, so the first request can return
  `headcount: 0`. Documented in the README's Run it section; a
  `SmartInitializingSingleton` would close it properly.

## Decisions taken, with reasons

**`EmployeeService` keeps seven dependencies.** Splitting read-side assembly into
its own service was suggested and rejected: `update()` and `deactivate()` both
return `detail()`, so the split creates a bidirectional dependency rather than
removing coupling. If the count matters, extract a package-private
`EmployeeDetailAssembler(employees, salaries, bands)` and the service drops to
five.

**`saveAndFlush` inside `@Transactional` is deliberate**, not redundant. It
forces a unique-index violation to surface inside the method where the exception
handler maps it to 409, rather than at commit time where it escapes and becomes
a 500. There is a comment saying so.

**`EmployeeService.update()`'s explicit version comparison is not redundant with
JPA's `@Version`.** The method reloads the entity fresh inside its own
transaction, so Hibernate's check can never fire for a stale client request. The
explicit comparison is the only thing catching it. There is a comment saying so.

**The pay-band gap for three roles at PRINCIPAL is intentional.** It is what
makes `summary.unbandedCount` a real figure rather than a permanent zero, and
what lets the outlier tests prove they are not silently dropping anyone.
