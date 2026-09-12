# 4. Current salary in its own table, history appended separately

Date: 2026-09-12

## Status

Accepted

## Context

Each employee has exactly one current salary, and superseded salaries are
retained rather than overwritten (`requirements.md` §5). The employee list and
every analytics aggregate read the current salary; only the detail screen reads
history.

Options considered: a single append-only table using temporal intervals, with
current identified by an open `effective_to` and a partial unique index; current
salary columns denormalized onto `employee` with a separate history table; and a
dedicated current-salary table alongside a history table.

Putting salary columns on `employee` would give the fastest possible read — no
join at all — but places the salary feature's state inside the employee
feature's table, against the package-by-feature rule in `CLAUDE.md`.

## Decision

Two tables, both owned by `salary/`:

- `salary` — the current salary, `UNIQUE(employee_id)`.
- `salary_history` — append-only, every superseded row, with `effective_to` and
  `change_reason`.

A raise updates `salary` and inserts the superseded values into `salary_history`
within one `@Transactional` service method.

## Consequences

Feature boundaries hold: `employee/` owns identity, `salary/` owns compensation.

Analytics join `employee` → `salary` 1:1 on a unique index. Negligible at 10k
rows, and the list endpoint reads through a projection query rather than
entities (design §4), so no N+1 arises.

**Two writes must agree.** This is the real cost. Mitigated by the single
transaction, by deriving the history row from the row being replaced, and by an
integration test asserting that a partially failed raise writes nothing.

Concurrent raises would corrupt the pair — both reading the same current row,
both writing history, one silently winning. Addressed by ADR-0007.

History rows retain their own frozen FX rate (ADR-0001).
