# How this was built with AI

A record of method and outcomes, including where the method failed. `Claude.md` holds the
standing instructions the agents worked under; this describes what was actually done with them.

---

## The method

**Design before code, and keep the argument separate from the decision.**

1. A **spec** (`docs/superpowers/specs/`) — the design and its reasoning, written and reviewed
   before any implementation.
2. **ADRs** (`docs/adr/`) — one decision each, in Nygard format, append-only. Three of the nine
   were written *during* implementation because implementation discovered something the design
   had not anticipated.
3. **Implementation plans** (`docs/superpowers/plans/`) — the spec turned into ordered tasks,
   each with its exact test code and implementation code, written before execution began.
4. **Execution** — one fresh agent per task, given only that task's brief, the interfaces it
   consumes, and the global constraints. Never the accumulated history of previous tasks.
5. **Review after every task** — a separate agent, with the diff, the brief and the task's
   report, asked specifically whether each test could pass for a reason other than the one its
   name claims.
6. A **whole-branch review** at the end on the strongest available model.

The spec is the binding authority. Where the plan and the spec disagreed, the spec won — that
rule settled the ADR numbering collision in §"What the plan got wrong" below.

**Model selection was deliberate, not uniform.** Transcription-shaped tasks whose brief already
contained the code ran on the cheapest tier. Work needing judgment — component wiring, cross-stack
changes, anything where a brief might be wrong — ran a tier up. Reviews were scaled to the risk of
the diff. The final whole-branch review ran on the most capable model available and took six
passes.

---

## What it produced

| | Backend | Frontend |
|---|---|---|
| Commits | 61 | 97 |
| Tests | 162 | 163 |
| Reviews | per-task + final | per-task + final |

Tests are integration-first: the backend runs against real PostgreSQL via Testcontainers, never
H2, because the design depends on `percentile_cont`, partial unique indexes and
`SELECT … FOR SHARE` — behaviours an in-memory substitute does not reproduce.

---

## What the reviews caught

**About twenty defects, nearly all of them in the plan rather than in the code written from it.**
The implementations came back faithful; what they were faithful *to* was repeatedly wrong. A
representative sample:

- **An instruction that was simply false.** The plan said binding an unused named parameter to a
  Hibernate native query was "harmless". It throws. Following it would have 500'd every
  single-band outlier request and failed all 14 tests in that suite. Caught by reading the plan
  against the real repository *before* Task 1 ran.
- **Code that would not compile**, five times over — an explicit type argument on `toSignal` that
  breaks Angular's overload resolution. Invisible to a green test suite (see below).
- **A fix that was exactly backwards.** Filter dropdowns rendered blank when unfiltered. The
  "fix" set the sentinel option's value to `null` — and Material's own source treats `null` as a
  *reset*, making such an option permanently unselectable. The real fix was the documented
  `canSelectNullableOptions` opt-in.
- **A knowingly-broken step.** One task instructed the implementer to write a polling loop, expect
  it to fail, then replace it. Ruled out before execution; the broken version was never committed.
- **Two kinds of HTTP 409 that needed opposite treatment** — a stale version (reload prompt) and a
  uniqueness violation (show the message) — which the client could not distinguish, so duplicate
  emails failed silently.

### Two "green" signals that meant nothing

1. **`npm test` does not type-check.** `isolatedModules: true` makes the Jest transform
   transpile-only. One task shipped 30 passing tests against code that would not build.
2. **`tsc --noEmit` does not check Angular templates.** After adding it as a guard, a template
   error still shipped: `tsc` silent, `ng build` failing. Only the Angular compiler checks
   template bindings.

Both were found by something downstream breaking, not by the guard. The final guard is `ng build`.

### A suite that was green against a working tree that lied

Late on, a regression test was found **modified and uncommitted** — rewritten to assert the bug it
had been written to catch, with the rewrite left unstaged so `git log` looked clean. Every
"105/105 passing" reported until then had been measured against that edit. The lesson was cheap
and permanent: **check `git status`, not just `git log`.**

### Sabotage as the standard of proof

A test nobody has seen fail is not yet a test. Where a test guarded something important, the
change was only accepted once the implementer had **broken the thing on purpose and shown the
failure**:

- swap `switchMap` for `mergeMap` → the cancellation test fails on `stale.cancelled`;
- flag the out-of-band badge by row index instead of by ratio → the row-identity test fails;
- render one row's USD figure in another's row → `Received: "…₹3,712,500.00$127,000.00…"`;
- revert `isVersionConflict` to `isConflict` → the duplicate-email test fails;
- remove the `<mat-error>` → the silent-save test fails.

---

## What the method missed, and why

**The HR manager could not add an employee.** `requirements.md` §3 lists create as in scope. The
backend implemented it fully — 11 validated fields, 8 passing tests. The frontend never consumed
it: no route, no screen, no `create()` on the API service.

It survived a pre-flight scan, ten task reviews and a six-pass final review. The reason is
structural and worth stating plainly:

> Every review asked **"does this diff match its brief?"** and the answer was always yes.
> Nobody asked **"does the whole thing do the job it was commissioned for?"**

A diff-scoped review cannot see an **absence**. The plan listed `POST /employees` in its API
contract table and `create()` in a produced interface, then never wrote a task that built it — and
no later document ever checked the delivered feature set back against §3. It was found in about
ninety seconds when the original problem statement was re-read against the running application.

The correction is a checklist step, not more review: **before calling work done, read the
requirements and tick each one against the running software.**

Two smaller things came from the same check: hire date, employee number and status were missing
from the detail screen, and `docker compose up --build` served no user interface at all — the
plan's own definition of done, unmet, because nothing ever ran it.

---

## Verification that earned its keep

Four defects were invisible to 163 passing frontend tests and only appeared when the application
was actually run against the real backend with 10,000 seeded employees:

- **compa-ratio crossed the wire as a JSON number**, not a string. Every frontend fixture used
  `'1.0000'`; the API sent `1.0`. Trailing zeros vanished in the UI — a ratio of exactly 1.0020
  rendered as `1.002`, and the column whose purpose is scanning against a band came out ragged.
- **Every filter dropdown rendered blank** when nothing was filtered — the state the screen sits
  in most of the time.
- **A blank full name failed with no feedback of any kind**: the toast was suppressed on the
  assumption the form rendered field errors, and the form rendered exactly one of them.
- **Zoneless could not be settled by unit test.** The test named
  *"proving the chart library works without zone.js"* proved nothing — the spec runs under
  `zone.js/testing` while the app does not. It was settled by loading the dashboard in a browser,
  changing a filter, and watching both charts and the table repaint with `window.Zone` undefined.
  That evidence, and its costs, are [ADR-0009](adr/0009-zoneless-angular.md).

One near-miss in the other direction: a band filter appeared to be ignored, which looked exactly
like the defect that feature exists to prevent. It was a stale JAR — Spring silently ignores an
unmapped request parameter. Rebuilding before reporting avoided a false accusation against working
code. **Verification tooling lies as readily as tests do.**

---

## Decisions taken on the author's behalf

Thirty-one, each recorded at the time with its reasoning and what it would cost if wrong. They
fell into three groups:

- **Plan corrections** — the plan contradicted itself or the repository, and the spec or the code
  settled it.
- **Systemic corrections** — guards that turned out insufficient (`npm test` → `tsc` → `ng build`).
- **Genuine design calls**, the ones most worth a second opinion: labelling the two 409 kinds;
  guarding rather than cancelling late write responses; treating an *unlabelled* 409 as a stale
  version, because an unnecessary reload costs a click while a swallowed error costs the user
  their work; and removing zone.js from the browser build entirely rather than configuring
  zoneless and still shipping it.

Everything deliberately **not** done is recorded with its reasoning in
[`docs/superpowers/2026-09-13-frontend-followups.md`](superpowers/2026-09-13-frontend-followups.md)
and its backend counterpart — including two open scope questions and the known-weak tests, so that
nothing reads as an oversight when it was a decision.
