# Payscope frontend — follow-ups

Everything reviews raised on the frontend branch that was deliberately **not** fixed, with the
reasoning. Recorded so none of it is silently rediscovered, and so the decisions are not
optimised away by someone reading the code cold.

## Two scope questions for the author, not defects

**Insights state does not round-trip through the URL.** The employee list's filters, sort and page
survive a refresh and can be pasted to a colleague. The insights screen carries four filters, a
group-by selection and a histogram cross-filter, none of which does. The spec's §10 subsection is
titled "URL is the source of truth for **list** state" and the implementation delivers exactly
that — so this is a gap in the spec, not a failure against it. It is worth raising because the
persona's job is circulating findings, and the identical filter bar next door produces a shareable
link. Closing it means extending the list's `toQueryParams`/`applyQueryParams` pattern to
`InsightsStore` and wiring the same router effect.

**Two grouping dimensions can produce more bars than a chart can show.** The spec caps `groupBy`
at two *dimensions*; nothing caps the resulting *groups*. Verified against live data: Country ×
Role returns 54 groups, which `[view]="[720, 360]"` renders as 54 horizontal bars about 6px apart —
illegible for the explicitly non-technical reader the chart exists to serve. The cap in the spec is
on the wrong quantity. The table beneath still carries every group correctly, so the fix is to cap
or top-N the *chart series* only, not the data.

## Deliberate decisions — do not "simplify" these

**`EmployeeDetailStore` guards write results on the active id rather than cancelling them.** A read
is cancelled when superseded; a write is not. The server has already applied a write, so cancelling
its request would leave the user unsure whether their change saved. What must not happen is its
*result* repainting a different employee's page, so the request runs to completion and only the
state update is conditional. Same race, deliberately opposite remedy.

**An unlabelled 409 is treated as a stale-version conflict.** `isVersionConflict` is
`status === 409 && conflictKind !== 'UNIQUE_CONSTRAINT'`, so a 409 with no `conflictKind` leans
toward the reload prompt. An unnecessary reload costs a click; a swallowed uniqueness error costs
the user their work. The direction is chosen, not accidental.

**`NotificationService.notifyError` takes the set of fields the caller renders.** It suppresses the
toast only for field errors the form actually displays; anything else reaches the snackbar. This
exists because the alternative — assuming the form binds every field error — produced a Critical
defect where a blank full name failed with no feedback at all. Do not "simplify" it back to
suppressing all field errors.

**`setup-jest.ts` keeps `jest-preset-angular`'s deprecated bare import.** It prints a deprecation
warning on every run. It was left alone because `fakeAsync` was verified working with it, and the
documented replacement is churn against a working setup. The warning is known noise.

**`tsconfig.spec.json` targets ES2016 while the app targets ES2022.** TypeScript emits native
`async`/`await` from ES2017 onward and zone.js cannot patch it, which breaks `fakeAsync`. Measured:
ES2022 fails 7 specs, ES2016 and es5 both pass. ES2016 is the highest target that avoids the
problem, so it is the smallest divergence from the app that works.

## Known-weak tests, left as they are

**`employee-detail.store.spec.ts`'s "surfaces field errors so the form can highlight the offending
input"** asserts only store state. The component-level test added during the final fix wave is what
actually proves the rendering; this one is kept for the store contract but its name overpromises.

**`OutliersApiTest`'s `returns_only_the_underpaid...` family and one compa-ratio assertion.** During
the compa-ratio string fix, one assertion (`UpdateEmployeeApiTest`, value `0.6988`) did not go red
before the change, because Spring's JsonPath coercion round-trips through `Double.toString()` and
that value has no trailing zeros to lose. It was kept and reported rather than swapped for a value
that would have gone red — a test that cannot distinguish the two encodings should be known to be
weak, not dressed up.

**`DistributionApiTest:137-139`** (inherited from the backend branch) comments that a duplicated
`groupBy` dimension does not count against the two-dimension cap. It does: the size check runs
before `.distinct()`.

## Minor items from the final review, not actioned

- `mat-paginator` renders unconditionally, showing "0 of 0" during loading and error rather than
  being suppressed with the table. The number is correct rather than stale, so it is polish.
- The URL-sync effect fires one redundant `replaceUrl` navigation on first load even when nothing
  changed. Harmless; no extra HTTP call, since requests are driven by the query computed.
- Sort *direction* is reachable in the store, the URL and `setSort`, but no control emits anything
  but the current value. Either add a direction toggle or drop the parameter.
- `MatChipsModule` is imported by `employee-list.component.ts` and never used — residue of the
  spec's "filter chips", delivered as dropdown selects instead.
- `EmployeeDetailStore.remove()` (soft delete) is implemented, correct and wired to no UI control.
  See the scope question below.
- `track()` lives in `insights.store.ts` but is a generic `RequestState` helper; `employee-list.store.ts`
  inlines the identical three operators. It belongs in `shared/request-state.ts`.
- Three near-identical filter shapes: `FilterValues`, `AnalyticsFilterValues`, and an inline literal
  in `employee-list.component.ts`.
- `EmployeeListStore` is `providedIn: 'root'` while the other two stores are component-provided;
  only the detail store documents why. Its HTTP pipeline stays subscribed for the app's lifetime.
- No route-id guard: `/employees/abc` sends `NaN`. Verified to degrade cleanly — the backend returns
  a 400 rendered in the error panel — so this is inconsistency with `toPageNumber`, not a bug.
- Deactivate has no confirmation step: one click, no undo, for a non-technical user.
- `index.html`'s title is still "Web".
- `zone.js` sits in `dependencies` though only Jest loads it now; it belongs in `devDependencies`.
- Both charts use a fixed `[view]="[720, 360]"` rather than a responsive size.
- Unsaved edits are discarded without warning when Deactivate or a recorded raise replaces the
  record. Refilling after a save is required; suppressing it for the other two paths needs care, and
  a confirmation step on Deactivate would address the same risk more simply.

## Soft delete stays backend-only, by decision

The detail screen briefly offered Deactivate and Delete side by side. Requirements §3 lists the
record operations as create, read, update, deactivate — delete is not among them, and the two
buttons asked a non-technical HR manager to arbitrate "no longer employed" versus "this record
should not exist", a distinction the data model needs and the user does not. Delete is removed from
the client: `confirmDelete`, `EmployeeDetailStore.remove()` and `EmployeeApiService.remove()` are
gone.

The backend keeps soft delete untouched — `DELETE /employees/{id}`, `deleted_at`, the partial unique
indexes, ADR-0005, and its tests all stand. It remains a capability the API has that the client
deliberately does not surface.
