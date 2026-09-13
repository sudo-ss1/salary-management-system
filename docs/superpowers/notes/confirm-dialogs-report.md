# Confirmation dialogs for deactivate and delete

## What was built

- `web/src/app/shared/confirm-dialog.component.ts` - new, generic
  `ConfirmDialogComponent`. Standalone, `OnPush`, takes `MAT_DIALOG_DATA` of
  `{ title, message, confirmLabel, destructive? }`, closes with `true` (confirm
  click) or `undefined` (Cancel / backdrop dismiss via `mat-dialog-close`). No
  employee-specific knowledge lives in it - the caller supplies the wording.
- `web/src/app/employees/employee-detail.component.ts` - the Deactivate button
  now opens `ConfirmDialogComponent` before calling `store.deactivate()`. A new
  Delete button (styled `color="warn"`) opens a second, more emphatic
  confirmation, then calls `store.remove()` and navigates to `/employees` on
  success via an injected `Router`. Both dialogs interpolate `person.fullName`
  into the title and message, e.g. "Deactivate Asha Menon?" and "Delete Asha
  Menon?".
- `web/src/app/employees/employee-detail.store.ts` - `remove(id, onSuccess?)`
  gained an optional success callback, invoked only when `activeId` still
  matches (the same guard `save`/`deactivate` already use), so navigation
  never fires for a delete whose page has since been abandoned.
- No changes to `deactivate()`'s request body - it still sends `{}`, no
  version token, as required.

## TDD: red first

Added to `employee-detail.component.spec.ts` and `employee-detail.store.spec.ts`
before touching any production code (commit `59048c8`). Actual failure output:

```
FAIL src/app/employees/employee-detail.component.spec.ts
  ✕ does not deactivate when the confirmation is cancelled
  ✕ does not delete when the confirmation is cancelled
  ✕ deletes and returns to the employee list once the confirmation is accepted
  ✕ names the employee in the deactivate confirmation instead of asking generically
  ✕ names the employee in the delete confirmation instead of asking generically
Tests: 5 failed, 8 passed, 13 total

FAIL src/app/employees/employee-detail.store.spec.ts
  ✕ runs the onSuccess callback only after the delete request completes
Tests: 1 failed, 14 passed, 15 total
```

Sample failures: `No button found with label "Delete"` (button didn't exist),
`Expected no open requests, found 1: POST /api/employees/7/deactivate`
(deactivate fired with no confirmation gate), and
`Cannot read properties of null (reading 'textContent')` on
`document.querySelector('mat-dialog-content')` (no dialog was ever opened).

Implementation added in commit `55fbdc4` turned all of the above green with no
other test changes.

## Test-strength check

Per the reviewer note about tests passing for the wrong reason: every
"cancelling issues no request" test has a sibling "confirming issues the
request" test right next to it (both for deactivate and delete), so a
component that simply never wired up the action at all would fail the confirm
test even though it would trivially pass the cancel test. Same logic applied
to the store: `does not run the onSuccess callback for an employee no longer
on screen` sits beside `runs the onSuccess callback only after the delete
request completes`, which also asserts the callback has *not* fired before
the response is flushed - a version that called `onSuccess` synchronously
inside `remove()` would fail that assertion even though "eventually gets
called" tests alone wouldn't catch it.

The "names the employee" tests query `document.querySelector('mat-dialog-content')`
against a real (unstubbed) `MatDialog`, not the `open` mock used elsewhere in
the file - so they can't pass merely because "a dialog opened", only because
the actual rendered text contains "Asha Menon".

## Verification (all four, after final commit)

```
npm test                                             -> Test Suites: 21 passed, 21 total; Tests: 133 passed, 133 total
npx tsc --noEmit -p tsconfig.app.json                 -> no output, exit 0
npx tsc --noEmit -p tsconfig.spec.json                -> no output, exit 0
npx ng build --configuration development              -> "Application bundle generation complete."
```

133 = 125 pre-existing + 8 new (6 in `employee-detail.component.spec.ts`, 2 in
`employee-detail.store.spec.ts`).

## Commits

- `59048c8` - test: prove deactivate and delete need a named confirmation first
- `55fbdc4` - feat: require confirmation before deactivating or deleting an employee

Both commits are local only; nothing was pushed.

## Disagreements / things worth a second look

- The task asked for the Delete button to live somewhere on the detail screen
  but didn't specify placement. I put it next to Deactivate in the same
  `.actions` row, styled `color="warn"` to visually distinguish it as the more
  destructive of the two - Deactivate stays a plain stroked button. This is a
  judgment call, not dictated by the spec; if the design intent is to separate
  it further (e.g. its own row, or gated behind a menu) that's a follow-up.
- `remove()`'s new `onSuccess` callback parameter is a small deviation from
  every other write in the store, which only ever emit through `state`/
  `saving`/`conflict`/`fieldErrors` signals. I considered a `removed` signal
  instead, but a callback keeps the "navigate on success" concern entirely in
  the component that owns the router, rather than adding a signal to the
  store whose only consumer is a one-shot navigation. Flagging it in case the
  project would rather standardize on signals-only for consistency.
- I did not add a dedicated `confirm-dialog.component.spec.ts`. The component
  is exercised (naming, confirm, cancel) through
  `employee-detail.component.spec.ts`; a standalone unit spec would mostly
  duplicate that coverage. Happy to add one if isolated coverage of the
  shared component is wanted as it gets reused elsewhere.
