# Insights dashboard: URL is the source of truth

## What changed

The insights dashboard's four filters, group-by selection and histogram
cross-filter now round-trip through the URL, mirroring the pattern already
used by `EmployeeListStore`/`EmployeeListComponent`.

**`web/src/app/insights/insights.store.ts`**
- Added `toQueryParams()` (only non-default values are written, so a clean
  view has a clean URL) and `applyQueryParams()` (restores from a bookmarked
  or shared URL).
- `applyQueryParams()` sets signals directly rather than through
  `setFilter`/`setGroupBy`/`setOutlierBand` - those setters reset
  `outlierPage` as a side effect of a *live* filter change, which would
  otherwise clobber a restored `outlierPage` before it took hold.
- Fixed a real bug this surfaced: `setOutlierBand()` unconditionally reset
  `outlierPage` to 0, even when the band was being set to the value it
  already had. `OutlierTableComponent` re-asserts whatever `selectedBucket`
  it's given the moment it mounts (including one just restored from the
  URL), so this silently wiped a restored `outlierPage` on every visit to a
  URL carrying both an `outlierBand` and a nonzero `outlierPage`. Fixed by
  making the setter a no-op when the band is unchanged.

**`web/src/app/insights/insights.component.ts`**
- Constructor reads `route.queryParams` once with `take(1)` (restoring
  before anything else runs), then an `effect()` keeps the URL in step with
  `replaceUrl: true` - the same ordering and the same reasons
  `EmployeeListComponent` relies on: `take(1)` resolves synchronously, before
  the effect's first asynchronous run, so the restore can't be stripped by
  it; and once `take(1)` unsubscribes, the effect's own navigation has
  nobody left listening to feed back into the store, which is what keeps it
  from looping.
- `selectedBucket` (a plain component signal driving the histogram, not
  store state) is derived from the restored `outlierBand` on restore, rather
  than being persisted separately.

## Group-by array

`groupBy` is `readonly GroupByDimension[]`. Angular's router already handles
repeated keys (`?groupBy=COUNTRY&groupBy=LEVEL`) as an array on
`ActivatedRoute.queryParams` and `HttpParams.append` on the way out, so no
special encoding was needed - `toQueryParams()` just returns the array as a
plain `string[]` field, and `applyQueryParams()` normalizes a single value,
an array, or `undefined` into the same shape.

A restored `groupBy` is validated against the four known dimensions,
deduplicated, and capped at `MAX_GROUP_BY` (2). A URL naming a dimension the
control doesn't offer has that entry dropped; a URL naming three or more
dimensions is capped rather than passed to `setGroupBy()`, which throws for
exactly that case by design (a UI control should never allow it, but a
person can type anything into a URL). If nothing valid survives, it falls
back to the default (`['COUNTRY']`).

## Malformed values

- `outlierPage`: guarded the same way `employee-list.store.ts`'s
  `toPageNumber` guards `page` - a non-integer or negative value falls back
  to 0, so `?outlierPage=banana` never reaches the server as the literal
  string `"NaN"`.
- `outlierBand`: only `'LT_80'` and `'GT_120'` are accepted. Anything else -
  including `'B90_110'`, a real compa-ratio bucket key that just isn't a
  valid *outlier* band - falls back to `null` (no filter) rather than
  forwarding an enum the backend would reject as a 400 the user can't act on.
- `groupBy`: see above.

## Red output (representative)

Store, before `toQueryParams`/`applyQueryParams` existed:
```
● InsightsStore › caps a hand-edited url asking for three group-by dimensions at two, rather than throwing
  TypeError: store.applyQueryParams is not a function
```
(6 of 15 tests failed this way; the other 9 pre-existing tests were untouched.)

Store, before the `setOutlierBand` fix:
```
● InsightsStore › leaves the outlier page alone when the band is set to the value it already has
  expect(received).toBe(expected)
  Expected: 2
  Received: 0
```

Component, before `InsightsComponent` gained `ActivatedRoute`/`Router`
wiring (verified by re-stashing `insights.component.ts` after implementing
it, to confirm the test-only commit was genuinely red):
```
Tests:       4 failed, 4 passed, 8 total
```
(the 3 pre-existing bucket/group-label tests, converted to
`RouterTestingHarness`, kept passing; the 5 new URL-state tests failed.)

## Verification (final, on the committed state)

```
npm test                                            145 passed, 145 total (133 baseline + 12 new)
npx tsc --noEmit -p tsconfig.app.json                clean
npx tsc --noEmit -p tsconfig.spec.json               clean
npx ng build --configuration development             succeeds
```

## Commits

1. `test: cover insights URL round-trip on InsightsStore` (red)
2. `feat: round-trip insights filters, group-by and outlier state through URL` (green; includes the `setOutlierBand` fix)
3. `test: cover insights URL restore and write-back on InsightsComponent` (red)
4. `feat: restore and persist insights view state via the URL` (green)

## Disagreements / things worth a second look

- `country`/`department`/`level`/`status` are restored from the URL without
  validating against `COUNTRIES`/`DEPARTMENTS`/`LEVELS`/`STATUSES` - this
  matches `EmployeeListStore.applyQueryParams` exactly (it doesn't validate
  these either, nor `sort`/`direction`), so I followed the existing
  precedent rather than inventing stricter handling for insights alone. If
  that's actually a latent gap, it's a pre-existing one shared by both
  stores, not something new here - worth raising separately rather than
  fixing asymmetrically in just one of the two.
- The `setOutlierBand` fix (skip when band is unchanged) changes existing
  behavior slightly: calling `setOutlierBand(currentBand)` is now a true
  no-op instead of always resetting the page to 0. I couldn't find any
  existing test or call site relying on the old always-reset behavior, and
  the new behavior is more correct on its own terms (re-affirming an
  unchanged band narrows nothing), but it's a production behavior change
  that fell out of building this feature rather than something the task
  asked for directly, so flagging it explicitly.
