# 5. Soft delete, kept distinct from employment status

Date: 2026-09-12

## Status

Accepted. Extends `requirements.md` §3, which has only `deactivate`.

## Context

`requirements.md` provides deactivation — an employee leaves the company. A
separate need exists to remove a record that should not exist at all, such as a
duplicate or a data-entry error.

It is tempting to serve both with one flag. They are different facts. An
employee who left is a business truth that stays analytically meaningful: last
year's payroll legitimately includes leavers. A mistaken record is a data truth
that should never appear anywhere. Merging them makes "we have 400 leavers"
indistinguishable from "someone fat-fingered 400 records".

## Decision

`employee.deleted_at TIMESTAMPTZ NULL`, independent of `status`.

Deactivation sets `status = INACTIVE`; the row stays visible and filterable.
Deletion stamps `deleted_at`; the row becomes invisible in the list, returns 404
on detail, and is excluded from every analytics aggregate.

Uniqueness becomes partial: `UNIQUE(email) WHERE deleted_at IS NULL` and
`UNIQUE(employee_number) WHERE deleted_at IS NULL`.

`deleted_at` lives only on `employee`. **No aggregate may query `salary` without
joining `employee`.**

## Consequences

Analytical questions about leavers remain answerable; erroneous records vanish
completely. The two concepts stay separable forever.

Without the partial indexes, a deleted person's email would be permanently
burned and re-creating them would fail. With them, deleting frees the address
for reuse.

The join requirement is a standing constraint on every future analytics query. A
`salary`-only sum would silently include deleted people in total payroll. This
is the sharpest edge of the decision and is stated in the design rather than
left to be rediscovered.

Hibernate's `@SQLRestriction` covers entity loads but **does not apply to native
queries**, which the list projection and all analytics aggregates are. The
predicate is therefore written explicitly in those queries. Four visible
repetitions are preferred to one annotation that silently misses the queries
that matter.

404 is returned for deleted records rather than 410, so deleted and absent are
indistinguishable to a client.
