# 2. Pay bands are keyed on country, in local currency

Date: 2026-09-12

## Status

Accepted. Supersedes the pay-band assumption in `requirements.md` §5.

## Context

`requirements.md` §5 states that pay-band midpoints are seeded per role and
level. §3 separately requires compa-ratio against band midpoints to surface
under- and over-payment, flagging anyone below 80% or above 120%.

These two do not compose across countries. A senior engineer in India and one in
the UK face very different market rates. Measured against a single global
midpoint, compa-ratio stops detecting pay problems and starts detecting
geography: every employee in a lower-cost country falls below 80%, the outlier
list fills with people who are paid correctly, and the feature becomes noise.

Alternatives considered: a global midpoint multiplied by a per-country location
factor — closer to how comp teams model geo tiers, but the effective midpoint is
derived rather than stored and so is harder to audit; and keeping the global
band as written, accepting a geography-dominated outlier list.

## Decision

`pay_band` is keyed `UNIQUE(role, level, country_code)` and holds `min`, `mid`
and `max` in that country's local currency.

Compa-ratio is computed as `amount_original / band.mid`, both sides in the same
local currency.

## Consequences

FX never enters the fairness calculation. Compa-ratio is unaffected by rate
changes, which is correct — a currency movement is not a pay decision.

Compa-ratio is dimensionless, so it aggregates across countries without
violating the rule against mixing currencies. `medianCompaRatio` is therefore
a legitimate cross-country comparison in a way that a USD median is not.

Two distinct answers now exist for "how does this group get paid": USD
percentiles answer cost, compa-ratio answers fairness. Neither is authoritative
for the other's question, and the UI must label them so.

Seed data grows to roles × levels × countries rows (~200–300). Generated, not
hand-written.

A `(role, level, country)` combination with no band yields a null compa-ratio.
See ADR-0005 and the design §8: these employees are surfaced via
`summary.unbandedCount`, never silently dropped.
