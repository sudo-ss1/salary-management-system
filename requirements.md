# Payscope — Requirements

**Author:** Shashank Singh
**Status:** v2
**Date:** 2026-09-12 (v1) · 2026-09-14 (v2 — see Revisions)

---

## 1. Goal

**Payscope** gives the HR Manager of a ~10,000-employee, multi-country
organization a web application that replaces the current spreadsheet workflow,
and that can answer
questions about how the organization pays its people — across departments,
countries, roles and levels — despite salaries being denominated in different
currencies.

## 2. Persona

**HR Manager at ACME.** Non-technical. Owns salary data correctness for the whole
org. Two recurring jobs:

- *Operational:* find an employee quickly, check or correct their record.
- *Analytical:* answer questions from leadership such as "what do we typically
  pay a senior engineer in India versus the UK?", "what is our total payroll
  cost?", "is anyone badly out of band?"

The second job is the one spreadsheets fail at today, so it is the centre of this
design rather than an afterthought.

## 3. In scope

- **Employee records** — create, read, update, deactivate. Name, email,
  department, country, role, level, employment type, hire date, status.
- **Salary records** — amount in the employee's local currency, with an
  append-only history of changes.
- **Browse at scale** — server-side pagination, filtering (country, department,
  level, status), sorting and search across 10,000 employees.
- **Multi-currency normalization** — every salary stored in its original currency
  *and* as a converted base-currency (USD) amount, so org-wide figures are
  comparable.
- **Pay insights** — the analytical job above. The specific reports, and why
  those, are §4.
- **Seed script** generating 10,000 realistic employees across multiple countries.
- **Automated tests** — unit tests for domain logic and analytics math,
  integration tests for persistence and API behaviour.

## 4. Reporting scope — the questions, and why these

No report list was prescribed. These were chosen by asking what an HR Manager is
actually *asked*, and which of those a spreadsheet at 10,000 rows across six
currencies cannot answer. Four questions, four features:

**"What do we pay a given role, at a given level, in a given country?"**
→ **Distribution.** p25 / p50 / p75 / p90 and mean per group, grouped by up to
two of country, department, role, level. Percentiles rather than an average
alone, because pay is right-skewed: a handful of senior salaries pull the mean
above what anyone actually earns, and it is the median that a compensation
conversation runs on. Two grouping dimensions, not N, because the reader is
non-technical and a three-way pivot is a spreadsheet again.

**"What does this organization cost, and how many people is that?"**
→ **Summary.** Headcount and total cost-to-company in USD, over the same
filters as everything else. The first number leadership asks for, and the one
that most needs a single stated currency behind it.

**"Is anyone paid wrongly?"**
→ **Compa-ratio** against the midpoint of each employee's role/level/country pay
band, shown as a histogram of the whole org. This is the most diagnostic figure
in the system and the reason pay bands exist in the data model at all: it is
*dimensionless*, so an INR salary and a GBP salary are directly comparable with
no FX involved, and 0.72 means the same thing in Bengaluru as in London. A raw
salary comparison across countries cannot make that statement.

**"Then show me those people."**
→ **Outliers.** The below-80% and above-120% histogram bands are clickable, and
selecting one fills a table beneath the chart with exactly those individuals —
191 and 199 of them respectively, matching the histogram buckets — each row
linking straight to that person's editable record. Analysis that ends at a chart
gets screenshotted; analysis that ends at a named record gets acted on. The band
is a backend query parameter rather than a client-side filter over one page,
because filtering a returned page would filter *one page* and leave the count
disagreeing with the rows — see `docs/performance.md`.

Every report honours the same four filters (country, department, level, status),
because the questions above are almost never asked about the whole org — they are
asked about a country or a function.

**Deliberately not reported:**

- **Pay trend over time.** The salary history table could support it, but seeded
  history is invented history; a trend line over fabricated raises would look
  insightful and mean nothing. The capability is in the schema, not on a chart.
- **Budget-vs-actual, forecasting, merit-cycle modelling.** Payscope is not the
  system of record for budgets, and inventing one would be inventing the answer.
- **Pay equity by demographic.** The most valuable thing this data could support.
  See §5 for why it is out.

## 5. Out of scope — and why

- **Authentication, roles, multi-tenancy.** The brief describes one organization
  with one persona. Tenancy would add an identity layer and isolation testing
  that serve no stated requirement, and would cost the time this build spends on
  the data model and analytics. I have built tenant-isolated systems in
  production; excluding it here is a scope decision, not a capability gap.
- **Live exchange-rate feeds.** Rates come from a stored, dated table seeded with
  fixed values, and conversion happens once at write time with the rate frozen
  alongside the amount ([ADR-0001](docs/adr/0001-usd-base-currency-converted-at-write-time.md)).
  This keeps analytics deterministic and testable, keeps a graded demo
  independent of a third-party API, and means a historical figure never silently
  changes because a rate moved. Swapping in a live provider changes one
  collaborator, not the design.
- **Reporting in a currency other than USD or the salary's own.** The database
  holds exactly two truthful money figures per salary — the original amount and
  the USD amount at the rate recorded that day. Any third currency would require
  inventing a rate at read time, which is the thing ADR-0001 exists to prevent.
  Local-currency reporting *is* defensible where a filtered view happens to span
  one country only, and is recorded as a follow-up rather than built, because it
  is a presentation gain over an aggregate that is already correct.
- **Payroll execution** — payslips, disbursement, tax and statutory deductions.
  A different domain with different compliance requirements. The brief asks for
  *managing and understanding* salary data, not paying it out.
- **Demographic pay-equity analysis.** Genuinely the most valuable thing this
  data could support, and the first thing I would add next. Excluded because
  doing it credibly requires demographic data I would not invent for a seed
  script, and doing it badly is worse than not doing it.
- **Bulk import/export, notifications, audit UI, UI internationalization.**
  Real needs for a production rollout, but none of them change the shape of the
  system, so they trade poorly against depth elsewhere.
- **Hard delete from the UI.** The API supports a soft delete and the schema
  needs the distinction, but the screen offers only *deactivate*. Showing both
  asks a non-technical user to arbitrate "no longer employed" versus "this record
  should never have existed" — a distinction the data model needs and the persona
  does not.

## 6. Scope decisions taken the other way

Two things were left open by the brief and were built anyway, which is as much a
scope decision as leaving them out:

- **Salary history, in full** — an append-only table, a `Record a raise` action
  that closes the current row and opens a new one in one transaction, and a
  history tab on the employee record. A current snapshot would have satisfied the
  brief. History was built because "why is this person's pay what it is?" is a
  question the persona is asked constantly, and because the alternative — an
  `UPDATE` over the salary — destroys the only evidence that a correction ever
  happened. It also forces the harder and more honest concurrency story
  ([ADR-0004](docs/adr/0004-current-salary-table-with-separate-history.md),
  [ADR-0007](docs/adr/0007-optimistic-locking-as-concurrency-and-idempotency-mechanism.md)).
- **Optimistic locking on both employee and salary** — for a stated single-user
  system this is arguably over-built. It is in because the same HR Manager with
  two browser tabs is not a hypothetical, and because a lost salary update is the
  one class of bug in this domain that is silent, permanent and unnoticed.

## 7. Assumptions

Stated explicitly because they were not specified in the brief.

- One current salary per employee; superseded salaries are retained as history
  rows rather than overwritten.
- Base currency is USD. Conversion happens at write time and the converted amount
  is persisted, so aggregates are stable and auditable rather than recomputed
  against whatever rate is current at read time.
- Pay-band midpoints are seeded per role, level and country, and are an input to
  the system rather than something derived from it.
- Employee data is synthetic and contains no real PII, so privacy hardening is
  deliberately minimal.
- A single HR Manager user; no identity layer. Concurrency is still handled, per
  §6.

## 8. Success criteria

- 10,000 employees seed in seconds, not minutes.
- Any page of the employee list returns in under 200 ms, with filtering and
  sorting done in the database.
- Every organization-wide monetary figure is expressed in one currency and can be
  explained to the person reading it.
- The insights feature answers at least three real HR questions correctly, with
  tests asserting the math against known values.
- A reviewer can clone the repository and have it running in under five minutes.
- A reviewer who does not want to run anything can open a hosted URL instead.

## Revisions

**v2 (2026-09-14).** v1 was written before implementation and is in the git
history at its original commit. v2 adds §4 (the reporting scope and its
reasoning), §6 (scope decisions taken *toward* inclusion), the currency-reporting
and hard-delete exclusions in §5, and the hosted-URL success criterion. Nothing
in v1 was withdrawn. The additions make explicit the decisions that were taken
during the build and previously lived only in ADRs and follow-up notes — they are
recorded here rather than back-dated into v1.
