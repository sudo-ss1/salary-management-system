# 9. Zoneless Angular

Date: 2026-09-13

## Status

Accepted. Relates to ADR-0006, which chose ngx-charts on the assumption that a
chart library fed precomputed scalars would not constrain the change-detection
strategy. This records the verification of that assumption against a rendered
dashboard.

The design reserved this number conditionally: zoneless was to be "a short
spike during scaffolding" earning an ADR "only if evidence supports it". This
is that evidence.

## Context

Payscope's client keeps all view state in signals. Stores are signal-based,
components are `OnPush` and read signals directly, and RxJS appears only at the
HTTP boundary, where `switchMap` cancellation does real work. Nothing in the
application mutates a plain field and waits for zone.js to notice.

Given that, `provideZoneChangeDetection()` buys nothing. zone.js monkey-patches
every asynchronous browser API — timers, event listeners, XHR, promises — to
discover that something *might* have changed, then checks the whole component
tree. A signal already knows precisely what changed and which views depend on
it. Running both means paying for a notification system whose answers are
already known.

The obstacle was never the application code; it was the chart library.
ngx-charts is the one dependency Payscope does not control, it is pinned at
24.0.2 (25.x requires Angular 21+), and it manipulates SVG geometry in response
to resize and hover events. If it depended on zone.js to schedule a repaint,
charts would render blank or stale, and the failure would appear only in a
browser — never in a jsdom unit test.

The implementation plan therefore refused to record this decision on the
strength of a passing unit test, and it was right to. The spec
`renders an svg, proving the chart library works without zone.js` does **not**
prove what its name claims: `jest-preset-angular` loads `zone.js/testing` for
every spec and the TestBed never calls `provideZonelessChangeDetection()`, so
that test exercises ngx-charts inside a zone.js harness — the opposite of the
application's configuration. It is evidence that the initial render needs no
`ResizeObserver` polyfill and no asynchronous tick. It is silent on zoneless.

## Decision

Use `provideZonelessChangeDetection()`, and remove zone.js from the browser
build entirely.

The second half matters. Configuring zoneless while still shipping zone.js
leaves the payload cost in place without the benefit, and Angular says so
directly — `NG0914: The application is using zoneless change detection, but is
still loading Zone.js`. The plan assumed zone.js had to stay in
`angular.json`'s polyfills because `jest-preset-angular` needs it. That is
wrong: Jest loads zone.js from `node_modules` via `setup-jest.ts`, and never
reads `angular.json`. The two are independent, so the browser can drop it while
`fakeAsync` and `tick` remain available in tests.

## Consequences

Verified by rendering, against the real backend with 10,000 seeded employees,
not by assumption:

- Both charts draw — six bars on the median-pay chart, five on the compa-ratio
  histogram — with axis labels, formatted currency ticks and plain-English band
  names.
- Interaction-driven updates work end to end. Selecting a country in the filter
  bar repainted the summary tiles (headcount 10,000 → 1,012), both chart SVGs
  (six bars → one) and the distribution table (six rows → one). That path is
  click → signal → HTTP → signal → repaint, with no zone.js present to schedule
  any of it.
- `typeof window.Zone === 'undefined'` in the running application, and zone.js
  is absent from the production bundle. Initial bundle: 379.38 kB raw,
  98.87 kB transferred.
- Zero console errors and, after removing the polyfill, zero warnings. NG0914
  is gone because the condition it describes no longer holds.

What this costs:

- **Change detection now depends entirely on signal discipline.** Mutating a
  plain field and expecting the view to update will silently do nothing. There
  is no zone.js to catch the omission, and the failure is a stale screen rather
  than an error. This is the real price, and it falls on every future change,
  not just the ones written today.
- **Tests and the application no longer share a change-detection strategy.**
  `setup-jest.ts` loads `zone.js/testing` so `fakeAsync`/`tick` can drive
  debounces and cancellation deterministically, and TestBed remains
  zone-based. A component could therefore pass its specs and still fail to
  update in the browser. Every component in this codebase is `OnPush` and reads
  signals, which makes the gap narrow — but it is a gap, and it is why the
  decision was settled in a browser rather than in Jest.
- **ngx-charts is verified at 24.0.2 only.** The verification is a snapshot of
  one version's behaviour, not a guarantee about the library. Upgrading it —
  particularly to 25.x, which requires Angular 21+ — re-opens this question and
  should be re-checked the same way: in a browser, with a filter change, not
  with a unit test.

If this is ever reverted, the change is one line in `app.config.ts` and
restoring `zone.js` to `angular.json`'s polyfills. Nothing else in the
application depends on it, which was the point of keeping state in signals.
