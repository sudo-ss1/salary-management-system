# Payscope — Requirements

**Author:** Shashank Singh
**Status:** v1
**Date:** 2026-09-12

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
- **Pay insights** — the analytical job above, concretely:
  - median and percentiles (p25/p50/p75/p90) by department, country, role, level
  - compa-ratio against pay-band midpoints, to surface under- and over-payment
  - total cost-to-company and headcount, in base currency
  - outlier detection (compa-ratio below 80% or above 120%)
- **Seed script** generating 10,000 realistic employees across multiple countries.
- **Automated tests** — unit tests for domain logic and analytics math,
  integration tests for persistence and API behaviour.

## 4. Out of scope — and why

- **Authentication, roles, multi-tenancy.** The brief describes one organization
  with one persona. Tenancy would add an identity layer and isolation testing
  that serve no stated requirement, and would cost the time this build spends on
  the data model and analytics. I have built tenant-isolated systems in
  production; excluding it here is a scope decision, not a capability gap.
- **Live exchange-rate feeds.** Rates come from a stored, dated table seeded with
  fixed values. This keeps analytics deterministic and testable, and keeps a
  graded demo independent of a third-party API. Swapping in a live provider is a
  change to one collaborator, not a redesign.
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

## 5. Assumptions

Stated explicitly because they were not specified in the brief.

- One current salary per employee; superseded salaries are retained as history
  rows rather than overwritten.
- Base currency is USD. Conversion happens at write time and the converted amount
  is persisted, so aggregates are stable and auditable rather than recomputed
  against whatever rate is current at read time.
- Pay-band midpoints are seeded per role and level, and are an input to the
  system rather than something derived from it.
- Employee data is synthetic and contains no real PII, so privacy hardening is
  deliberately minimal.
- A single HR Manager user; no concurrent-edit or locking semantics beyond
  ordinary transactions.

## 6. Success criteria

- 10,000 employees seed in seconds, not minutes.
- Any page of the employee list returns in under 200 ms, with filtering and
  sorting done in the database.
- Every organization-wide monetary figure is expressed in one currency and can be
  explained to the person reading it.
- The insights feature answers at least three real HR questions correctly, with
  tests asserting the math against known values.
- A reviewer can clone the repository and have it running in under five minutes.