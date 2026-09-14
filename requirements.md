# Payscope — Requirements

**Shashank Singh** · v2 · written 2026-09-12, revised 2026-09-14 (note at end)

## Goal & persona

Replace ACME HR's spreadsheet workflow with a web application that manages salary
for ~10,000 employees across six countries and answers questions about how the
organisation pays people, despite salaries being in different currencies.

The user is **one HR Manager, non-technical**, with two recurring jobs:
*operational* — find an employee, correct the record; *analytical* — answer
leadership ("what do we pay a senior engineer in India versus the UK?", "what does
payroll cost?", "is anyone badly out of band?"). The second is what spreadsheets
fail at, so it is the centre of the design, not an afterthought.

## In scope

- **Employee records** — create, read, update, deactivate.
- **Salary records** — local-currency amount, append-only history.
- **Browse at scale** — server-side pagination, filter, sort, search over 10,000 rows.
- **Multi-currency normalisation** — each salary stored in its original currency
  *and* as USD, converted once at write time against a fixed, dated FX table with
  the rate frozen on the row ([ADR-0001](docs/adr/0001-usd-base-currency-converted-at-write-time.md)).
- **Pay insights** — the four reports below.
- **Seed** of 10,000 realistic employees; unit and integration **tests**.

## Reporting — the four questions, and why these

Nothing prescribed a report list. These are what an HR Manager is actually *asked*
and what a spreadsheet cannot answer at 10,000 rows across six currencies.

1. **"What do we pay a role, at a level, in a country?"** → **Distribution:**
   p25/p50/p75/p90 and mean, grouped by up to two of country, department, role,
   level. Percentiles rather than an average alone, because pay is right-skewed —
   a few senior salaries drag the mean above what anyone earns, and it is the
   median a compensation conversation runs on.
2. **"What does the organisation cost?"** → **Summary:** headcount and total
   cost-to-company, in one stated currency.
3. **"Is anyone paid wrongly?"** → **Compa-ratio** against each employee's
   role/level/country band midpoint — the most diagnostic figure here because it
   is *dimensionless:* an INR and a GBP salary compare directly with no exchange
   rate involved, and 0.72 means the same in Bengaluru as in London. A raw salary
   comparison across countries cannot make that statement.
4. **"Then show me those people."** → **Outliers:** the <80% and >120% bands are
   selectable and fill a table of exactly those individuals, each row linking to
   the editable record. Analysis ending at a chart gets screenshotted; analysis
   ending at a named record gets acted on.

All four take the same filters — these questions are asked about a country or a
function, rarely about the whole org.

## Out of scope — and why

| Excluded | Why |
|---|---|
| Auth, roles, multi-tenancy | One org, one persona. An identity layer serves no stated requirement and costs the time spent on the data model and analytics. A scope decision, not a capability gap. |
| Live FX feeds | Fixed dated rates keep analytics deterministic, and a historical figure never changes because a rate moved. Swapping in a provider changes one collaborator. |
| Reporting in a third currency | The database holds exactly two truthful figures per salary. A third means inventing a rate at read time — what ADR-0001 exists to prevent. |
| Pay trend over time | History is in the schema, but seeded history is invented history. A trend line over fabricated raises would look insightful and mean nothing. |
| Pay equity by demographic | The most valuable thing this data could support, and the first thing I'd add. Out because credible analysis needs demographic data I won't invent, and doing it badly is worse than not doing it. |
| Payroll execution | Payslips, tax, disbursement — different domain, different compliance. The brief asks for managing and understanding salary data, not paying it out. |
| Hard delete in the UI | API and schema support it ([ADR-0005](docs/adr/0005-soft-delete-distinct-from-employment-status.md)); the screen offers only *deactivate*. "No longer employed" vs "should never have existed" is a distinction the data model needs and the user does not. |
| Bulk import/export, notifications, audit UI, i18n | Real for a rollout, but none change the shape of the system. |

**Built although optional**, which is equally a scope decision: salary history in
full ([ADR-0004](docs/adr/0004-current-salary-table-with-separate-history.md)),
because an `UPDATE` over a salary destroys the only evidence a correction
happened; and optimistic locking
([ADR-0007](docs/adr/0007-optimistic-locking-as-concurrency-and-idempotency-mechanism.md)),
because one HR Manager with two browser tabs is not hypothetical and a lost salary
update is the one bug here that is silent, permanent and never noticed.

## Assumptions

One current salary per employee. USD base, converted at write time. Pay-band
midpoints are seeded input, not derived. Data is synthetic — no real PII. A single
user and no identity layer; concurrency handled regardless.

## Success criteria

Seed 10,000 in seconds. Any list page under 200 ms, filtered and sorted in the
database. Every org-wide money figure in one currency that can be explained to its
reader. Insights answer at least three real HR questions, with tests asserting the
math. A reviewer can open a hosted URL, or clone and run in under five minutes.

---

*v1 (2026-09-12) preceded implementation and stands unaltered in git history. v2
adds the reporting rationale and the decisions settled during the build. Full
reasoning per decision is in the nine ADRs under `docs/adr/`; everything knowingly
left undone is in `docs/superpowers/*-followups.md`.*
