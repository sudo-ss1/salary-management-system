# Demo script

A five-minute walkthrough that shows the brief satisfied rather than the software
toured. Ordered so the *analytical* job — the one spreadsheets fail at — gets the
most time, because that is the harder half of the problem statement.

Before recording: open the app cold, let the seed finish, then reload so nothing
on screen is mid-load. Have a second tab on `requirements.md` only if you want to
point at the exclusions.

---

## 0:00 — The problem, in one sentence (20s)

> "ACME's HR team manages salary for 10,000 people across six countries in
> spreadsheets. Two jobs: correct a record, and answer questions about how the
> org pays. Here's both."

Land on the employee list with the full 10,000 showing.

## 0:20 — Browse at scale (50s)

- Point at the total: **10,000 employees**, 25 on screen.
- Type a partial name in search. Note the pause — **debounced**, and superseded
  requests are cancelled rather than allowed to land late.
- Apply Country = India, Level = Senior. The total updates.
- **Say the point:** every one of those filters, the sort and the page number are
  in the URL. Copy the address bar. That is how a finding gets sent to someone.
- Change the page size to 100 and note the list is not noticeably slower — the
  work is in the database, not the browser.

## 1:10 — Correct a record (60s)

- Open an employee. Point out the layout: identity facts, current pay leading,
  then editable details.
- Edit the name, **Save**. It persists.
- **Record a raise** — new amount, effective date. The history tab now shows both
  rows, the old one closed off.
- **Say the point:** this is append-only. An `UPDATE` over the salary would erase
  the only evidence that a correction happened, and "why is this person's pay what
  it is?" is a question this persona is asked constantly.
- Only **Deactivate** is offered, not Delete. The API supports a soft delete; the
  screen deliberately does not, because asking a non-technical user to choose
  between "no longer employed" and "should never have existed" is asking them to
  arbitrate a schema detail.

## 2:10 — Answer the pay questions (100s)

Switch to **Insights**. This is the centre of the demo.

- **"What does the org cost?"** — headcount and total CTC, stated in USD.
- **"What do we pay a senior engineer in India versus the UK?"** — group by
  Country × Role. Point at **p50**, not the mean: pay is right-skewed, and a
  handful of senior salaries drag an average above what anybody actually earns.
- **Say the currency point explicitly** — it will be asked. Every salary is stored
  twice: the original amount, and a USD amount converted at write time with the
  rate frozen alongside it. Org-wide figures are therefore comparable *and*
  stable — a historical total never silently changes because a rate moved.
- **"Is anyone paid wrongly?"** — the compa-ratio histogram. This is the strongest
  thing to say in the whole demo:

  > "Compa-ratio is each salary against the midpoint of its own role, level and
  > country band. It's dimensionless — so an INR salary and a GBP salary are
  > directly comparable with no exchange rate involved at all. 0.72 means the same
  > thing in Bengaluru as in London. A raw salary comparison across countries
  > can't make that statement."

- **Click the "below 80%" bar.** The table beneath the chart fills with exactly
  those 191 people. Click a name — it opens their record, editable.
- **Say the point:** analysis that ends at a chart gets screenshotted; analysis
  that ends at a named, editable record gets acted on. That filter is a backend
  query parameter, not a filter over the current page — otherwise the count at the
  bottom would disagree with the rows on screen.

## 3:50 — Create an employee (30s)

- Create one. Then try the same email again and show the **409** surfacing as a
  field-level message, not a silent failure.
- If time allows: open the same record in two tabs, save in one, then save in the
  other. The stale-version conflict offers a reload rather than silently
  overwriting. **Say the point:** a lost salary update is the one bug in this
  domain that is silent, permanent and never noticed.

## 4:20 — How it was built (40s)

Screen on the repo, not the app.

- `requirements.md` — scope, persona, and **what was deliberately left out, with
  reasons**. Point at the exclusions, not the inclusions.
- `docs/adr/` — nine decision records. Name **0008**: the project's own rule is
  that money is never a float, and `percentile_cont` forces one — so the exception
  is bounded, measured and written down rather than hidden.
- `docs/ai-process.md` and `docs/ai-prompts.md` — how AI was used, the prompts
  themselves, and **what the method missed**: every review asked "does this diff
  match its brief?", so an absent required feature passed every gate. A
  diff-scoped review cannot see an absence.
- `./mvnw test` → 162. `npm test --prefix web` → 158. Integration tests run
  against real PostgreSQL via Testcontainers, never H2, because the design depends
  on `percentile_cont`, partial unique indexes and `SELECT … FOR SHARE`.

## 5:00 — Close (15s)

> "Three things I'd do next: pay-equity analysis by demographic, which is the most
> valuable thing this data could support and is out only because I won't invent
> demographic data for a seed script; local-currency display when a view is scoped
> to one country; and confirmation-on-navigation for unsaved edits."

---

## Don't

- Don't narrate the UI ("now I'll click here"). Narrate the *decision* behind what
  is on screen.
- Don't demo the test suite passing. Say the number and move on.
- Don't apologise for anything in the follow-up list — it is written down, which is
  the point.
