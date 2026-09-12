# 1. USD base currency, converted at write time

Date: 2026-09-12

## Status

Accepted

## Context

Salaries are denominated in the local currency of the employee's country. Any
organization-wide figure — total cost to company, a median across countries —
requires a single comparable unit. Conversion can happen at read time, against
whatever rate is current, or at write time, with the result persisted.

Read-time conversion makes every historical figure move whenever a rate changes,
so the same question asked twice returns two answers and neither can be
explained. `requirements.md` §4 also excludes live rate feeds: rates come from a
stored, dated table, so analytics stay deterministic and testable.

## Decision

Base currency is USD. Conversion happens at write time and `amount_base_usd` is
persisted alongside `amount_original` and `currency_code`.

The `fx_rate` and `fx_rate_date` actually used are copied onto the salary row.
`salary_history` rows retain their own frozen rate; converted amounts are never
recomputed.

Organization-wide aggregation runs exclusively on `amount_base_usd`.

## Consequences

Aggregates are stable and auditable: any figure can be traced to the rate that
produced it, and re-running a report returns the same number.

Amending the `fx_rate` table does not retroactively change existing salaries.
Restating history would require an explicit backfill — deliberate, not
accidental.

Rows carry redundant data (rate plus converted amount). Accepted: the redundancy
is what makes the figure reproducible.

Swapping in a live rate provider changes one collaborator in `currency/`, not
the model.
