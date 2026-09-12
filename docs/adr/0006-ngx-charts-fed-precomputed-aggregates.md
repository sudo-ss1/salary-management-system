# 6. ngx-charts, fed only precomputed aggregates

Date: 2026-09-12

## Status

Accepted

## Context

The insights screen needs to make pay comparisons visible. Angular Material
ships no charting component, and `CLAUDE.md` requires new dependencies to be
justified rather than assumed.

A box plot was the initial candidate, being the conventional visual for
p25/p50/p75/p90. Two problems emerged.

First, the ngx-charts box chart accepts `BoxChartMultiSeries` — raw
`{name, value}` data points — and computes quartiles itself in the browser using
d3. That would require shipping raw salary rows to the client, violating the
rule that the frontend never receives the full employee set, and d3's quantile
uses R-7 interpolation, which does not match `percentile_cont` (ADR-0003). The
result would be a chart showing one median beside a table showing a different
one, on the same screen.

Second, the persona is explicitly non-technical. A box plot requires the reader
to know what a whisker represents. A chart needing a tutorial is worse than a
table.

## Decision

Adopt ngx-charts as the single new frontend dependency, pinned against Angular
20 before it is added.

Use no box plot. Two charts, both consuming precomputed scalars from SQL
aggregates in ngx-charts' native `{name, value}` format:

1. A horizontal bar of **median pay by group**, with exact p25/p50/p75/p90 in a
   table beneath it.
2. A vertical bar of **headcount by compa-ratio band** (`<80`, `80–90`,
   `90–110`, `110–120`, `>120`), computed by a `CASE` aggregate in SQL.

No statistical computation of any kind occurs in the browser.

## Consequences

ADR-0003 and this decision agree by construction. There is no path by which the
chart and the table can disagree, because both render the same SQL output.

The comparison the chart library was adopted for is preserved and is more
legible to the persona than a box plot would have been. The compa-ratio
histogram answers "is anyone badly out of band?" directly — the edge bars are
the answer — and clicking a bar filters the outlier table.

Spread is no longer shown graphically. It remains available as exact figures in
the table, which suits a reader who will quote numbers rather than interpret
shapes.

`summary` gains a `compaRatioBuckets` field rather than the system gaining
another endpoint.

The dependency pulls several d3 sub-packages onto one lazy-loaded route.

ngx-charts' compatibility with zoneless Angular could not be established from
available documentation. No decision on zoneless is recorded here; see the
design §13.
