# 7. Optimistic locking as the concurrency and idempotency mechanism

Date: 2026-09-12

## Status

Accepted. Supersedes the single-user assumption in `requirements.md` §5.

## Context

`requirements.md` §5 assumed one user and "no concurrent-edit or locking
semantics beyond ordinary transactions". Concurrency safety was subsequently
made a requirement.

Two hazards are real. Two simultaneous raises would corrupt the current/history
pair (ADR-0004): both read the same current row, both write history, one
silently wins. And a stale edit form submitted after someone else's change would
clobber it with no trace.

Separately, `POST` is not naturally idempotent. A double-submit — impatient user,
network retry — could create a duplicate employee or apply a raise twice.

Pessimistic locking (`SELECT … FOR UPDATE`) would serialize writers and invite
deadlocks in an application whose real contention is near zero. An
`Idempotency-Key` header with a replay table is the textbook answer but costs a
table, a filter, a TTL story and its own concurrency tests, for a persona of one
HR Manager at a desktop.

## Decision

`@Version` on `Employee` and on `Salary`, exposed as **`employeeVersion`** and
**`salaryVersion`** — never a single ambiguous `version` field.

Versions are required on `PUT /employees/{id}` and `POST
/employees/{id}/salary`, and **not** on `DELETE` or `deactivate`.

A 409 carries the current version in the `ProblemDetail`.

No `Idempotency-Key` table. Duplicate creates are caught by the partial unique
index on email (ADR-0005), never by a `SELECT`-then-`INSERT` pre-check.

The raise transaction takes `SELECT … FOR SHARE` on the employee row.

## Consequences

**The version doubles as an idempotency key for the operation that matters.** A
resubmitted raise replays the same `salaryVersion`; the first wins and bumps it,
the second gets 409. Applying a raise twice — the expensive mistake — is
impossible without extra machinery.

**Delete and deactivate must not take a version, or they could not be
idempotent.** They are transitions to a fixed target state, not read-modify-write,
so no lost update exists to prevent. Had a version been required, the first call
would bump it and a retry would 409 — contradicting the guarantee that a repeated
`DELETE` returns 204. This interaction was the reason for excluding them.

**Two version fields, not one.** A client editing an employee and a client
recording a raise need different tokens. A single `version` field would let the
wrong one be sent, failing confusingly or — worse — succeeding.

A retried create returns 409 rather than the existing employee. Accepted
limitation; the outcome is correct even though the message is mediocre.

Delete and raise do not naturally contend, since they update different rows with
different version columns. `FOR SHARE` on the employee row closes that window.
This is the one place pessimistic locking is used, and it is cheap because
contention is effectively zero.

Concurrency is testable without threads: load two detached copies, save the
first, save the second, assert `OptimisticLockingFailureException`. Deterministic
every run, satisfying the ban on timing-dependent tests.

Clients must carry and return versions, and the UI must handle 409 by prompting a
reload rather than retrying silently — a silent retry would re-create exactly the
lost update the version exists to prevent.
