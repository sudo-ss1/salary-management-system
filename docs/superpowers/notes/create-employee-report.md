# Add employee: closing the missing create feature

## What was built

- `web/src/app/employees/employee.models.ts` - new `CreateEmployeeBody`,
  mirroring the server's `CreateEmployeeRequest` (11 fields, `salary: Money`).
- `web/src/app/employees/employee-api.service.ts` - new `create(body)`. Posts
  with `observe: 'response'` (the server returns `201` with a `Location`
  header and no body - `ResponseEntity<Void>`), then maps the response to the
  numeric id parsed out of `Location: /api/employees/{id}` via
  `idFromLocation()`. Throws if the header is missing or unparseable, rather
  than silently resolving to something wrong.
- `web/src/app/shared/reference.ts` - new `COUNTRY_CURRENCIES` map and
  `currencyForCountry(code)`, mirroring the `country` table seeded in
  `src/main/resources/db/migration/V1__country_and_fx_rate.sql` (the same
  "mirror the server, comment the source" pattern `compa-ratio-bands.ts` uses
  for the compa-ratio band edges). `COUNTRIES` itself is untouched - currency
  is derived from country, never a field the user picks.
- `web/src/app/employees/create-employee.store.ts` - new `CreateEmployeeStore`
  (component-provided, like `EmployeeDetailStore`). `create(body, onCreated)`
  sets `saving`/`fieldErrors` signals, and on success calls `onCreated(id)`
  with the id from the API service. On failure it calls
  `NotificationService.notifyError(error, RENDERED_FIELDS)` - no hand-rolled
  error branching, unlike `record-raise-dialog.component.ts`.
  `RENDERED_FIELDS` deliberately omits `salary.currency`: the currency has no
  input of its own (it's derived and shown as a suffix), so any server error
  naming it falls through to the snackbar instead of vanishing.
- `web/src/app/employees/create-employee.component.ts` - new standalone,
  `OnPush` component at `/employees/new`. Renders all 11 fields; the country
  `mat-select` is backed by a signal (`countryCode`), and a `computed` derives
  `currency` from it via `currencyForCountry`, shown as the amount field's
  suffix and in its label. The submit button is disabled until a country is
  chosen (guards against posting a blank currency) and while saving. On
  success it navigates to `/employees/{id}`.
- `web/src/app/app.routes.ts` - new lazy `employees/new` route, listed
  **before** `employees/:id` (otherwise the router would match `new` as an
  id and land on the detail screen instead).
- `web/src/app/employees/employee-list.component.ts` - "Add employee" link
  next to the `<h1>`, routing to `/employees/new`. Without this the feature
  had no entry point.
- `web/src/app/employees/employee-detail.component.ts` - added a `<dl>` of
  employee number, hire date and status right under the name. `requirements.md`
  §3 lists all three as part of an employee record; the list screen already
  showed them, the detail screen showed none. Read-only, not form fields.

## Money and the currency rule

The salary amount is typed into a plain text input (`inputmode="decimal"`)
bound to `form.salaryAmount: string` and travels to the request body
unchanged - no `parseFloat`, no arithmetic, anywhere in the component or
store. The test asserts `typeof request.request.body.salary.amount === 'string'`
against the same string literal the test typed in, so a hidden round trip
through a number couldn't pass unnoticed.

## Location header

`EmployeeApiService.create()` is the only place that touches the header - it
returns `Observable<number>`, not the raw `HttpResponse`, so every caller
(store, component, tests) works with a plain id. `idFromLocation` is a small
regex match (`/\/(\d+)$/`) against the header value; it throws on `null` or a
malformed value rather than returning e.g. `NaN` and letting a bad navigation
happen silently.

## TDD: red first

Each unit was written test-first; here is the actual first failure for each:

```
$ npx jest employee-api.service.spec.ts
TypeError: service.create is not a function

$ npx jest shared/reference.spec.ts
TypeError: (0 , reference_1.currencyForCountry) is not a function

$ npx jest create-employee.store.spec.ts
Cannot find module './create-employee.store' from 'create-employee.store.spec.ts'

$ npx jest create-employee.component.spec.ts
Cannot find module './create-employee.component' from 'create-employee.component.spec.ts'

$ npx jest employee-list.component.spec.ts -t "add an employee"
Expected: not null   (querySelector('a[href="/employees/new"]') was null)

$ npx jest employee-detail.component.spec.ts -t "read-only facts"
Expected substring: "E-007"
Received string: "Back to employeesAsha MenonDetailsSalary history..." (no E-007 anywhere)
```

`app.routes.spec.ts`'s pre-existing "lazy loads every feature route" test
also went red as a direct, expected consequence of adding the route
(`Expected: 3, Received: 4`) - fixed by updating its assertion and adding
coverage for the new route's position and resolution.

## Test-strength check

- **409 duplicate email**: both `create-employee.store.spec.ts` and
  `create-employee.component.spec.ts` assert `document.body.textContent`
  contains "That email address is already in use" - not
  `store.fieldErrors()` (which is empty for this response; a uniqueness 409
  carries no field errors) and not a mock call. This is the direct regression
  guard for the Critical defect: a store-state assertion here would have
  passed even if nothing ever reached the snackbar.
- **Unclaimed field (`salary.currency`)**: same treatment - asserts visible
  text, proving the field reaches `NotificationService` rather than being
  silently absorbed because `fieldErrors` was non-empty.
- **Country -> currency**: the component test drives `onCountryChange('IN')`
  and then queries the DOM (`formField.textContent`) for "INR", plus a second
  test that switches to `'GB'` and asserts "GBP" appears while "INR" no
  longer does - a component that set a signal but never re-rendered, or that
  hardcoded one currency, would fail one of the two.
- **Valid submission -> navigation**: asserts the full POST body shape *and*
  `router.url === '/employees/42'` after flushing a response whose `Location`
  header names id 42 specifically (not id 7 or any id already in scope) -
  a hardcoded navigation target couldn't pass.
- Route ordering (`employees/new` before `employees/:id`) is asserted
  directly by index comparison, not just "both paths exist", since Angular
  matches routes in array order.

## Verification (all four, after final commit)

```
npm test                                  -> Test Suites: 25 passed, 25 total; Tests: 163 passed, 163 total
npx tsc --noEmit -p tsconfig.app.json     -> no output, exit 0
npx tsc --noEmit -p tsconfig.spec.json    -> no output, exit 0
npx ng build --configuration development  -> "Application bundle generation complete."
                                              create-employee-component chunk: 30.61 kB, lazy
```

163 = 145 pre-existing + 18 new (2 API service, 2 reference, 5 store, 6
component, 1 list entry point, 1 detail read-only fields, 1 route ordering/
resolution `app.routes.spec.ts` addition; net after the pre-existing
"exactly 3 routes" assertion was updated in place rather than counted as new).

## Commits (local only, none pushed)

1. `f4705d6` test: cover EmployeeApiService.create resolving the Location header
2. `698adf3` feat: add EmployeeApiService.create, resolving the id from Location
3. `04ea8b9` test: cover deriving a country's currency from the seeded country table
4. `aa2c8c3` feat: derive salary currency from country instead of offering a free choice
5. `8f38a55` test: cover CreateEmployeeStore's success, field-error and conflict paths
6. `8111e66` feat: add CreateEmployeeStore, reusing NotificationService.notifyError
7. `1c971b5` test: cover the create-employee form's submit, currency and error paths
8. `f33934f` feat: add the employees/new create-employee screen
9. `d96d7f2` test: cover the entry point for adding an employee from the list screen
10. `41f09fa` feat: add an "Add employee" action to the employee list screen
11. `61c3a27` test: cover hire date, employee number and status on the detail screen
12. `922e6da` feat: show hire date, employee number and status on employee detail
13. `67b8c29` test: update route tests for the new employees/new route
14. `d8441c3` fix: make CreateEmployeeComponent's submit handlers public

## Disagreements / things worth a second look

- **`create()`'s return type.** I had `EmployeeApiService.create()` return
  `Observable<number>` (the parsed id) rather than the raw `HttpResponse<void>`.
  The task said "surface the Location header so the caller can navigate" -
  I read that as "make the id available", not "hand back the header
  verbatim", since every caller only ever wants the id. If the intent was for
  the store/component to parse the header themselves, this is a deliberate
  deviation; I think centralizing the parsing (and its one failure mode) in
  the API service is the better place for it, but flagging the choice.
- **Client-side validation is minimal.** Per the constraints, the server
  remains the authority; I only disabled submit while a country is unselected
  or a save is in flight - no required-field checks, date-range checks, etc.
  on the client. This matches the existing codebase's convention (
  `record-raise-dialog`, `employee-detail`'s edit form) of relying entirely on
  server-driven field errors rather than duplicating validation rules
  client-side, but for an eleven-field creation form a non-technical HR
  manager might appreciate at least a "required" asterisk or disabled submit
  until the obviously-required fields are filled. I left it as-is to stay
  consistent with the rest of the app rather than introduce a new pattern
  unilaterally.
- **`record-raise-dialog.component.ts` was not touched.** The task called out
  its hand-rolled error handling as the reintroduction of the Critical defect,
  as a cautionary example for this new form - not as a request to fix it. I
  left it alone to avoid silently expanding scope; it's a clear follow-up
  candidate if the project wants it refactored onto
  `NotificationService.notifyError`.
- **Read-only facts layout.** `employee-detail.component.ts` now shows
  employee number, hire date and status in a small `<dl>` under the name,
  outside the tab group. Placement wasn't specified; I judged "facts about
  the record" belong above the editable form rather than inside either tab.
