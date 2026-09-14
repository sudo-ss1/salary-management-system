# Visual design pass on the Angular client

`mat.theme()` (azure/cyan, Roboto, density -1) had just been added, fixing
*broken* - serif type, black outlines, overlapping select panels. This pass
makes it *designed*: calm, dense, scannable, built for an HR manager who is
in this software all day. Presentation only - no behaviour, request shapes,
or DTOs changed.

## Global tokens (`web/src/styles.scss`)

- Page background moved to `--mat-sys-surface-container-low`; content sits on
  `--mat-sys-surface` via two new utility classes, `.surface-card` (hairline
  border, `--mat-sys-corner-large`, no heavy borders) and `.control-strip`
  (same surface, for filters - visually a control, not primary content).
- One 8px spacing scale (`--space-1` through `--space-7`), used everywhere
  instead of ad-hoc rem values, so page-header-to-filters-to-content rhythm is
  consistent across all four screens.
- `.page-header` - the repeating title / one-line context / right-aligned
  action pattern, shared by the employee list, insights and create-employee
  screens (the detail screen uses the same block, minus the action).
- `.chip` - a tone-neutral pill (`data-tone="positive"` / `"attention"`) used
  for status; `.cell-primary` / `.cell-secondary` - the two-line "bold text,
  quiet caption beneath" pattern for name+number and local+USD salary.
- A fix for a real defect, not a stylistic choice: `AlwaysShowErrorStateMatcher`
  (used so a server-only `<mat-error>` can be projected on demand) makes
  Material paint every such field with its red error outline permanently,
  error or not. `mat-form-field:not(:has(mat-error))` resets the outline/label
  tokens back to neutral exactly when there is no message to justify red -
  the moment a real `<mat-error>` renders, the selector stops matching and
  Material's own error styling takes over. Verified both ways (DOM inspection
  with and without a rendered `<mat-error>`).

## Screen by screen

**App bar** (`app.component.ts`) - brand left, hairline border under the bar
instead of a solid colour slab, nav links get a filled pill
(`--mat-sys-secondary-container`) as the active state via `routerLinkActive`.

**Employee list** - `.page-header` with a live result count ("10,000
employees" / "2,962 in India" once a country filter is set, computed from
`store.totalElements()` and `store.country()`). Search + the four filters +
sort now live in one `.control-strip`; `filter-bar.component.ts`'s fields
shrunk from `flex: 1 1 12rem` (stretch-to-fill) to `width: 12.5rem; flex: 0 0
auto` (natural width, wraps). The table: sticky header
(`position: sticky` on `th`), quiet row hover, name/role/salary all use the
two-line pattern, salary and compa-ratio columns and headers are
right-aligned (`.numeric-col`) with `.numeric` (tabular figures), compa-ratio
is a chip (neutral pill; `.out-of-band` swaps to the error container) -
`class="compa-ratio"` / `.out-of-band` kept verbatim for the two tests that
assert them and for Ben's row. Status is now a chip too (tertiary container
for active, neutral for inactive).

**Employee detail** - sections: identity facts (unchanged read-only `<dl>`,
now on its own surface with a status chip), current pay leads with a 2.25rem
pay figure and USD secondary, the compa-ratio chip sits directly beside its
band explanation (not a paragraph below), then editable details grouped into
two rows (name/email full-width-ish, then department/role/level/type), then
actions with Save primary and Deactivate/Delete pushed right via a spacer.
Salary history tab reuses the same numeric/two-line/hover treatment.

**Create employee** - one card split into three labelled groups (Identity /
Role / Starting pay) with a hairline rule between them, each field sized to
its content (name/email wide, enum selects medium, level/dates narrow)
instead of a uniform `flex: 1 1 16rem` grid. Primary action left, Cancel
beside it, both after a rule.

**Record-raise dialog** - tightened spacing scale, the inline error banner is
now a filled `error-container` chip instead of plain red text.

**Insights** - same `.page-header` (no action - this screen has none),
filters in a `.control-strip`. Summary tiles: figure is now the largest/only
bold element (2rem), label quiet above, note quieter still, headcount
formatted with `.toLocaleString()` for readability at 10,000. Compa-ratio
histogram and median-pay chart each sit in their own `.surface-card` with a
title. The "Compare groups" section gets its own heading, the percentile
table and outlier table use the same sticky-header/hover/numeric-right
treatment as the employee table.

**ngx-charts responsiveness (bug found and fixed):** both charts had a
hard-coded `[view]="[720, 360]"`, which produced a 720px-wide chart and a
horizontal scrollbar on the *entire page* below 720px - directly violating
the "nothing overlaps/overflows at 1280px, and works at phone width" rule.
Removed `[view]`, wrapped each chart in a `.chart-frame` (`width: 100%;
height: 320px`), which is what ngx-charts measures when `view` is absent (it
reads the chart element's parent's `getBoundingClientRect()`). Confirmed via
`document.documentElement.scrollWidth === clientWidth` at 400px before/after
(769px scrollWidth before the fix, 385px - no overflow - after).

**State panel** - centred icon-above-message-above-button, generous padding,
tokens instead of hard-coded `#b3261e` fallbacks. No markup change beyond
that (the "error_outline" literal text was always a `<mat-icon>` ligature; it
renders as a glyph now that Material Icons loads, which was already fixed
upstream of this pass).

## Verification

- `npm test` (web/): **163/163 passing**, run repeatedly through the pass.
- `npx tsc --noEmit -p tsconfig.app.json`: clean.
- `npx tsc --noEmit -p tsconfig.spec.json`: clean.
- `npx ng build --configuration development`: succeeds (initial bundle
  1.78 MB, lazy chunks per route).

## Screenshots

Yes - a Playwright MCP browser was available and used throughout, against
the live dev server on `localhost:4300` with the seeded 10,000-employee API.
Checked `/employees` (default, filtered by search, sorted by compa-ratio
ascending to inspect out-of-band styling), `/employees/1` (Details and
Salary history tabs, the raise dialog), `/employees/new`, and `/insights`,
each at 1280px and again at 400px width. Console messages were checked on
every navigation (0 errors, 0 warnings throughout). Computed styles were
inspected directly (`getComputedStyle`, class lists, `:has()` selector
matches) to confirm the error-outline fix and to find the exact CSS variable
names Angular Material's M3 form-field actually reads
(`--mat-form-field-outlined-error-*`, not the `--mdc-outlined-text-field-*`
names from older Material versions, which is why the first attempt at the
error-outline fix silently did nothing).

## Still worth doing

- The insights percentile table's "People" (headcount) column and the
  outlier table aren't locale-formatted the way the summary tiles' headcount
  now is - fine at these magnitudes (hundreds to low thousands) but worth a
  pass if group sizes grow.
- `record-raise-dialog.component.ts` and `confirm-dialog.component.ts` are
  functionally fine but got the least visual attention of anything touched;
  a dedicated pass on Material dialog spacing/typography tokens would bring
  them fully in line with the rest.
- No dark-mode toggle exists to click through, but every colour used here is
  a `--mat-sys-*` token, so it should be a clean swap when one is added -
  worth an explicit check once that lands.
- The compa-ratio histogram's in-band/out-of-band colours are read from
  `--mat-sys-primary` / `--mat-sys-error` via inline SVG `fill: var(...)`
  styles (ngx-charts applies its `Color.domain` as inline styles, which does
  resolve custom properties) - confirmed visually but worth a second look if
  ngx-charts is ever upgraded, since that's relying on undocumented behaviour
  of how the library sets fill.
