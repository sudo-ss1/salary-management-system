# 3. `percentile_cont` for all percentiles

Date: 2026-09-12

## Status

Accepted

## Context

Pay insights report p25/p50/p75/p90 by department, country, role and level.
Postgres offers `percentile_cont` (interpolating between the two straddling
values) and `percentile_disc` (returning an actual observed value).

`CLAUDE.md` requires analytics tests to assert exact expected values against a
fixed dataset, so this choice fixes every expected number in the suite and is
unpleasant to revisit.

The persona is a non-technical HR Manager who will carry these figures into
leadership conversations and compare them against other tools.

## Decision

All percentiles use `percentile_cont`, computed over `amount_base_usd`.

This governs `medianCompaRatio` as well, so a single payload never carries two
different percentile methods.

## Consequences

The median of an even-sized group is the mean of the two middle salaries, which
is what "median" means to the persona and what commercial compensation tools
report. Figures agree with the numbers leadership sees elsewhere.

A reported p50 may be a figure no employee actually earns. Harmless for a
distribution statistic over a continuous quantity, but it means a percentile
cannot be used to identify a specific person.

The analytics test fixture must include an even-sized group, so interpolation
behaviour is pinned by a test rather than assumed.
