# 8. Accepting a double-precision step inside `percentile_cont`

Date: 2026-09-13

## Status

Accepted. Relates to ADR-0003, which chose `percentile_cont`; this records a
consequence of that choice discovered during implementation, and confirms the
choice in light of it.

## Context

The design is emphatic that money is `BigDecimal` and never `double` or
`float`, and that aggregation happens in SQL over `numeric` columns. That rule
is the reason `Money` exists and the reason amounts cross the wire as strings.

Implementing the distribution endpoint surfaced something neither the design
nor ADR-0003 anticipated. PostgreSQL's `percentile_cont` is defined only over
`double precision` and `interval`:

    percentile_cont(fraction) WITHIN GROUP (ORDER BY double precision) -> double precision
    percentile_cont(fraction) WITHIN GROUP (ORDER BY interval)         -> interval

There is no `numeric` variant. Ordering by `amount_base_usd`, a
`numeric(19,4)` column, therefore casts implicitly to `double precision`, and
the interpolation between the two straddling salaries happens in IEEE-754
floating point. It also means `round(percentile_cont(...), 2)` does not
compile, because PostgreSQL has no `round(double precision, integer)` — the
original plan's SQL was wrong and failed to prepare.

So the choice in ADR-0003 quietly entails a floating-point step in the middle
of a system built to avoid one.

Three ways out were available:

- **`percentile_disc`** returns the input type, so it stays in `numeric` with
  no float anywhere. But it returns the lower of the two middle values for an
  even-sized group rather than their mean, which is the behaviour ADR-0003
  rejected: it disagrees with the median any spreadsheet or commercial
  compensation tool reports, which is an awkward conversation for a
  non-technical persona carrying the figure into a leadership meeting.
- **Compute percentiles in `numeric` arithmetic by hand** — window functions
  to locate the straddling rows, then interpolate. Exact, and considerably
  more SQL to write, read and defend for a difference that does not show up.
- **Keep `percentile_cont` and bound the error.**

## Decision

Keep `percentile_cont`. Cast its result to `numeric` before rounding:

    round(cast(percentile_cont(0.50) within group (order by s.amount_base_usd) as numeric), 2)

Every percentile in the system, including `medianCompaRatio`, goes through
the same cast, so one payload never mixes methods or precisions.

## Consequences

**The interpolation is not exact, and the rounding absorbs it.** A double
carries roughly 15-16 significant decimal digits. The largest figures here are
INR salaries around 10^7 with two decimal places — about nine significant
digits — so representation error lands far below the second decimal place, and
rounding to the currency's minor units removes it entirely. The fixture's
interpolated median of 118 800.00, the mean of 106 920 and 130 680, reproduces
exactly.

**The bound is a property of the magnitudes, not a guarantee.** It holds for
salary-scale figures. It would not hold for a currency and magnitude where
values approached the limit of double's significand, and a system aggregating
sums rather than percentiles at that scale would need the hand-written
`numeric` interpolation instead.

**The rule "money never touches a double" now has one stated exception**,
confined to percentile interpolation inside PostgreSQL. Money in the
application is still `BigDecimal` throughout, still crosses the wire as a
string, and totals and means still use `sum` and `avg`, which are exact over
`numeric`. Only the percentile path is affected.

**The cast is mandatory, not stylistic.** Without it the query does not
prepare at all. That is recorded as a Global Constraint in the implementation
plan so a later query does not rediscover it.

This was found by running the plan's own SQL against a real PostgreSQL. It
would not have been found by review: the SQL reads correctly, and the defect
is in a function signature rather than in the logic.
