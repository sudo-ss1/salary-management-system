# Prompts and configuration

`docs/ai-process.md` describes the method and what it caught. This file is the raw
material behind it: the standing configuration every agent worked under, the prompts
that opened each phase, the shape of a per-task dispatch, and — the part that
actually mattered — the corrections that were fed back when the output was wrong.

---

## 1. Standing configuration

Every agent in this project, including one-shot subagents that saw nothing else of
the session, read [`Claude.md`](../Claude.md) first. It is the constitution: stack,
commands, workflow, git rules, credential handling, architecture rules, domain rules,
testing rules, conventions, and a `Do not` list.

Four of its rules changed outcomes measurably, and are worth reading in the file:

| Rule | What it prevented |
|---|---|
| *"Integration tests run against real PostgreSQL via Testcontainers. H2 is forbidden."* | A green suite that proves nothing: the design depends on `percentile_cont`, partial unique indexes and `SELECT … FOR SHARE`, none of which H2 reproduces faithfully. |
| *"Money is `BigDecimal` in Java and a string on the wire. Never `double`, never a JS `number`."* | Silent precision loss at the JSON boundary. The one place a `double` was unavoidable is isolated and documented in [ADR-0008](adr/0008-accepting-a-double-precision-step-inside-percentile-cont.md). |
| *"A test must fail for the reason its name claims. Prove it by breaking the code."* | Tests that pass for the wrong reason. This is the single highest-yield line in the file — see §5. |
| *"Commit locally. Never push. Do not add, change or inspect remotes."* | An agent publishing an unreviewed branch. Enforced, not advisory: the repo has no remotes. |

Credentials are handled by the same file: `.env` is git-ignored before the first
commit, never read or echoed, and `.env.example` carries the key names with empty
values.

---

## 2. The prompts that opened each phase

Three, in order. Each invoked a process skill that supplied the workflow; the text
below is the whole of what was typed.

**Design.**

> Design Payscope: data model, analytics approach, API shape, and open questions
> (pay bands, percentile method, roles/levels/countries enumeration) before
> scaffolding.

Chosen deliberately to *name the open questions rather than answer them*. A prompt
that had asserted "use pay bands per role and level" would have got pay bands per
role and level and no argument about it. Naming them as open produced the
interrogation that became [ADR-0002](adr/0002-pay-bands-per-role-level-country.md)
— and the answer came back *different from the question*: bands needed a country
dimension too, because a band without one makes every Indian salary an outlier.

Output: [`docs/superpowers/specs/2026-09-12-payscope-design.md`](superpowers/specs/2026-09-12-payscope-design.md).

**Planning.**

> Create the implementation plan for Payscope from
> `docs/superpowers/specs/2026-09-12-payscope-design.md` — TDD cadence, one feature
> per commit, backend then frontend.

Output: two plans totalling ~4,000 lines, each task carrying its own test code and
implementation code verbatim ([backend](superpowers/plans/2026-09-12-payscope-backend.md),
[frontend](superpowers/plans/2026-09-13-payscope-frontend.md)).

**Execution.**

> go ahead with frontend plan

Short because the plan was the prompt. That is the point of writing the plan first:
by execution time there is nothing left to say, and the agent doing the work is
reading a document that was reviewed, not a sentence that was typed.

---

## 3. What a per-task agent actually received

Not the plan. Not the conversation. Not the previous tasks. Exactly five things:

1. One line on where the task sits in the project.
2. A path to a **brief** — that task's text extracted from the plan, introduced as
   *"read this first — it is your requirements, with the exact values to use
   verbatim."*
3. The interfaces and decisions from earlier tasks that the brief could not know.
4. Any ambiguity in the brief, already resolved.
5. A report path, and a contract: write the detail to the file, return only status,
   commits, a one-line test summary, and concerns.

Three constraints made this work, and each was learned by violating it:

- **Exact values live in the brief, never in the dispatch.** Two sources for one
  magic string is one source too many.
- **No accumulated history.** An early dispatch reached 42,000 characters, of which
  almost all was pasted "state after tasks 1–3". A fresh agent needs its task and
  its interfaces; prior narrative is noise that costs context and invites drift.
- **Agents do not spawn agents.** Every reviewer a worker spawned duplicated the
  review the controller was going to dispatch anyway.

Model tier was chosen per task, not per session: transcription-shaped tasks whose
brief already contained the code on the cheapest tier; multi-file wiring a tier up;
the final whole-branch review on the most capable model available, where it took six
passes.

---

## 4. The review prompt

Each task review received three files — the brief, the implementer's report, and a
generated package containing the commit list, the diffstat and the full diff with
context — plus the global constraints as an attention lens.

The question that earned its place:

> For each test in this diff: could it pass for a reason other than the one its name
> claims? If so, say which reason.

Most of the ~20 defects caught came from that question rather than from reading the
implementation. It is aimed at the specific failure mode of AI-written tests, which
is not that they are wrong but that they are *vacuous* — they assert something true
of both the correct and the incorrect implementation.

---

## 5. Validation: sabotage as the standard of proof

A passing test is a claim, not evidence. The standing rule is that a test must be
shown to fail when the behaviour it names is removed. Worked examples:

| Claim | Sabotage | Result |
|---|---|---|
| "Superseded search requests are cancelled" | Swap `switchMap` for `mergeMap` | Red. Claim proven. |
| "The list avoids N+1" | — | A count of rows would pass either way. Replaced with a **statement count**: a page of 10 and a page of 100 must both cost exactly 2. |
| "The chart library works without zone.js" | — | **Could not be sabotaged.** The test proved nothing; it was the *browser* that proved it. Recorded honestly in [ADR-0009](adr/0009-zoneless-angular.md) rather than left looking green. |

Two "green" signals turned out to be hollow, and both are written up in
`ai-process.md` instead of quietly deleted. One suite was even reported green
against a working tree that had an uncommitted test rewritten to assert the bug —
the lesson being that `git log` is not `git status`.

---

## 6. Refinement: the corrections that changed the build

The prompts below are quoted verbatim, typos and all, because a sanitised prompt log
misrepresents how this actually goes. Each one caught something that ~320 passing
tests and a six-pass whole-branch review had not.

> **"UI/UX is not upto the level, what is this, and its so minimal, without any design"**

`web/src/styles.scss` was **80 bytes** — the CLI's placeholder comment. Angular
Material had no theme at all, so every component rendered with structural CSS only:
browser-serif typography, black outlines, overlays colliding with the page. Every
automated check passed, because every automated check asserted DOM content and never
appearance. Fixed by building the theme and a design system on top of it; the cause
is recorded because it generalises — **a diff-scoped review cannot see an absence.**

> **"in the list of employess i am seeing Asha Adebayo name to often"**

Diagnosed as a data-quality bug, not cosmetics: the seed generator held 20 given
names × 20 family names = 400 combinations for 10,000 people, so the same person
appeared 28 times. Widened to 148 × 156 = 23,088. Distinct names per 100 rows went
from 4 to 79–89; worst-case repetition from 28× to 3×.

> **"why you have given two buttons deactiavte/delete"**

Correct, and my justification for the second button had been backwards — I had
argued it was worth surfacing because the API method was otherwise dead code, which
is reasoning from the implementation toward the user instead of the reverse.
Requirements §3 lists *deactivate*; delete is not among them. Removed from the
client entirely. See `requirements.md` §5.

> **"you should have created other branch for the front end"**

Also correct. The branch was split retroactively into `feat/payscope-backend` and
`feat/payscope-frontend`.

The pattern across all four: automation verified *behaviour*, and a human verified
*result*. Nothing in the first category catches an unstyled application, a name
appearing 28 times, or a button that should not exist.

---

## 7. What I would change about the prompting

- **Demand a screenshot at task one, not task ten.** The single cheapest fix
  available. A thin vertical slice that had to *look* right would have surfaced the
  missing theme on day one.
- **Add one review question:** *"does this do the job it was commissioned for?"*
  Every review asked "does this diff match its brief?", which is why an absent
  required feature — create-employee — passed every gate. A review scoped to a diff
  can only find what is present and wrong, never what is missing.
- **Make the plan's own definition of done executable.** `docker compose up --build`
  was in the plan as prose and was therefore never run by anything.
