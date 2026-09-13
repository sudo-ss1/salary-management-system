# Payscope Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Angular application an HR Manager uses to find and correct employee records, and to answer questions about how the organization pays people.

**Architecture:** Three lazy-loaded standalone feature routes. State lives in signal-based store services; RxJS appears only at the HTTP boundary, where cancellation does real work. No arithmetic happens in the browser — every aggregate is already computed in SQL.

**Tech Stack:** Angular 20 (standalone components, signals), Angular Material, ngx-charts, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-09-12-payscope-design.md` §10.
**Backend plan:** `docs/superpowers/plans/2026-09-12-payscope-backend.md` — the API contract this consumes. Build it first; these tasks assume it runs on `localhost:8080`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Angular 20, standalone components only.** No `NgModule` in application code.
- **Feature routes are lazy-loaded** via `loadComponent`.
- **State lives in signal-based services.** Components are `OnPush` and read signals directly.
- **RxJS is for HTTP orchestration only** — never for view state.
- **No state management library.** If one seems necessary, raise it before adding it.
- **ngx-charts is the only new runtime dependency.** Jest and its Angular preset are sanctioned test dependencies. Anything else needs asking first.
- **Charts consume precomputed scalars.** No statistical computation in the browser, ever — ADR-0006.
- **Money is a string and stays a string.** Format for display; never `parseFloat` it, never do arithmetic on it.
- **`employeeVersion` and `salaryVersion` are distinct tokens.** Never collapse them into one field.
- **A 409 is never silently retried.** It surfaces a reload prompt.
- **Every screen renders loading, empty and error as distinct states.**
- **TDD, three commits per behaviour:** the failing test, the implementation, any refactor. One feature per commit.
- **Commit locally. Never push.** No remotes.
- **No AI attribution in commit messages.**

### API contract this consumes

Base URL `/api`, proxied to `localhost:8080` in development.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/employees` | `country`, `department`, `level`, `status`, `q`, `page`, `size` (1–100), `sort`, `direction` |
| `POST` | `/employees` | 201 + `Location` |
| `GET` | `/employees/{id}` | includes `employeeVersion` and `salaryVersion` |
| `PUT` | `/employees/{id}` | requires `employeeVersion` |
| `POST` | `/employees/{id}/deactivate` | idempotent, 200 |
| `DELETE` | `/employees/{id}` | soft delete, idempotent, 204 |
| `POST` | `/employees/{id}/salary` | requires `salaryVersion`, 200 |
| `GET` | `/employees/{id}/salary-history` | array, newest first |
| `GET` | `/analytics/summary` | `headcount`, `totalCostToCompanyUsd`, `meanBaseUsd`, `unbandedCount`, `compaRatioBuckets` |
| `GET` | `/analytics/distribution` | `groupBy` (≤ 2 of `DEPARTMENT`, `COUNTRY`, `ROLE`, `LEVEL`) |
| `GET` | `/analytics/outliers` | paginated |

Money is always `{"amount": "125000.00", "currency": "INR"}`. Errors are RFC 7807: `title`, `detail`, optional `errors: [{field, message}]`, optional `currentVersion`.

Sort values: `FULL_NAME`, `HIRE_DATE`, `SALARY`, `COUNTRY`, `DEPARTMENT`, `LEVEL`, `COMPA_RATIO`.
Compa-ratio buckets: `LT_80`, `B80_90`, `B90_110`, `B110_120`, `GT_120`.

---

## File Structure

```
web/
  package.json  angular.json  tsconfig.json  jest.config.js  setup-jest.ts  proxy.conf.json
  src/
    main.ts  index.html  styles.scss
    app/
      app.config.ts                    providers: router, http, animations, change detection
      app.routes.ts                    three lazy routes
      app.component.ts                 shell: toolbar + router-outlet
      core/
        money.ts                       Money type + formatMoney
        money.pipe.ts
        problem-detail.ts              RFC 7807 types + ApiError
        api-error.interceptor.ts
        notification.service.ts        snackbar wrapper
      employees/
        employee.models.ts             API response types
        employee-api.service.ts        HTTP only
        employee-list.store.ts         signals + URL sync
        employee-detail.store.ts
        filter-bar.component.ts        shared by list and insights
        employee-list.component.ts
        employee-detail.component.ts
        salary-history.component.ts
        record-raise-dialog.component.ts
      insights/
        analytics.models.ts
        analytics-api.service.ts
        insights.store.ts
        insights.component.ts
        summary-tiles.component.ts
        median-pay-chart.component.ts
        compa-ratio-histogram.component.ts
        outlier-table.component.ts
      shared/
        request-state.ts               loading | empty | error | ready
        state-panel.component.ts       renders the non-ready states
```

---

### Task 1: Angular project, Jest, and the routing shell

Folds in build config, test runner, routing and the dev proxy — none is independently reviewable.

**A note on zoneless.** The app is configured zoneless from the start, because state is signals end-to-end and RxJS never drives the view. This is **not yet ADR-0008**: it cannot be recorded until ngx-charts is proven to render without zone.js, which happens in Task 9. If that fails, Task 9 reverts this one line and nothing else changes.

**Files:**
- Create: `web/package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `jest.config.js`, `setup-jest.ts`, `proxy.conf.json`
- Create: `web/src/main.ts`, `index.html`, `styles.scss`
- Create: `web/src/app/app.config.ts`, `app.routes.ts`, `app.component.ts`
- Create: placeholder feature components for the three routes
- Test: `web/src/app/app.component.spec.ts`, `web/src/app/app.routes.spec.ts`

**Interfaces:**
- Produces: `appConfig` providers; `routes` with `/employees`, `/employees/:id`, `/insights`; `AppComponent` shell.

- [ ] **Step 1: Write the failing test**

`web/src/app/app.routes.spec.ts`
```ts
import { routes } from './app.routes';

describe('application routes', () => {
  it('redirects the empty path to the employee list', () => {
    const root = routes.find(r => r.path === '');
    expect(root?.redirectTo).toBe('/employees');
  });

  it('lazy loads every feature route rather than bundling them into the shell', () => {
    const features = routes.filter(r => r.path !== '' && r.path !== '**');
    expect(features.length).toBe(3);
    features.forEach(route => expect(typeof route.loadComponent).toBe('function'));
  });

  it('exposes the three screens the two user jobs need', () => {
    const paths = routes.map(r => r.path);
    expect(paths).toEqual(expect.arrayContaining(['employees', 'employees/:id', 'insights']));
  });
});
```

`web/src/app/app.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('names the application in the toolbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Payscope');
  });

  it('offers navigation to both user jobs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a[routerLink]'));
    expect(links.map(a => a.getAttribute('routerLink'))).toEqual(
      expect.arrayContaining(['/employees', '/insights']),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — no project exists.

- [ ] **Step 3: Write minimal implementation**

Scaffold, then replace the test runner:
```bash
npx @angular/cli@20 new web --standalone --style=scss --routing=false --skip-git --skip-tests --package-manager=npm
cd web
npm remove karma karma-chrome-launcher karma-coverage karma-jasmine karma-jasmine-html-reporter jasmine-core @types/jasmine
npm install --save-dev jest@29 jest-preset-angular@14 @types/jest@29
npm install @swimlane/ngx-charts
npm install @angular/material @angular/cdk
```

Pin whatever `@swimlane/ngx-charts` version resolves against Angular 20 and record it in `package.json` with an exact version, not a caret range. If it refuses to install against Angular 20, stop and raise it — ADR-0006 assumes it works, and a peer-dependency override is a decision, not a workaround.

`web/jest.config.js`
```js
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json'],
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
};
```

`web/setup-jest.ts`
```ts
import 'jest-preset-angular/setup-jest';
```

`web/package.json` — replace the test script:
```json
  "scripts": {
    "start": "ng serve --proxy-config proxy.conf.json",
    "build": "ng build",
    "test": "jest"
  }
```

`web/proxy.conf.json`
```json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false
  }
}
```

`web/src/app/app.routes.ts`
```ts
import { Routes } from '@angular/router';

/**
 * Three routes, one per user intent. Each is lazy so the insights bundle -
 * which carries the chart library - never loads for someone who only came to
 * correct an employee record.
 */
export const routes: Routes = [
  { path: '', redirectTo: '/employees', pathMatch: 'full' },
  {
    path: 'employees',
    loadComponent: () =>
      import('./employees/employee-list.component').then(m => m.EmployeeListComponent),
  },
  {
    path: 'employees/:id',
    loadComponent: () =>
      import('./employees/employee-detail.component').then(m => m.EmployeeDetailComponent),
  },
  {
    path: 'insights',
    loadComponent: () => import('./insights/insights.component').then(m => m.InsightsComponent),
  },
  { path: '**', redirectTo: '/employees' },
];
```

`web/src/app/app.config.ts`
```ts
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // State is signals end to end and RxJS never drives the view, so zone.js
    // would be pure overhead. Confirmed against ngx-charts in Task 9 - if that
    // fails, this line becomes provideZoneChangeDetection() and nothing else changes.
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([])),
    provideAnimationsAsync(),
  ],
};
```

`web/src/app/app.component.ts`
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar color="primary">
      <span class="brand">Payscope</span>
      <nav>
        <a mat-button routerLink="/employees" routerLinkActive="active">Employees</a>
        <a mat-button routerLink="/insights" routerLinkActive="active">Insights</a>
      </nav>
    </mat-toolbar>
    <main><router-outlet /></main>
  `,
  styles: [`
    .brand { font-weight: 600; margin-right: 2rem; }
    main { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
  `],
})
export class AppComponent {}
```

Create minimal placeholder components at the three feature paths so the lazy imports resolve — each a standalone component rendering its own name. They are replaced in Tasks 5, 6 and 9.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "chore: scaffold Angular application with Jest and lazy feature routes

Three routes, one per user intent, each lazy so the insights bundle and
its chart library never load for someone correcting a record.

Configured zoneless: state is signals throughout and RxJS never drives the
view. Not yet recorded as an ADR - ngx-charts must be proven to render
without zone.js first."
```

---

### Task 2: Money formatting and typed API errors

The two primitives every screen depends on. Implements spec §10's money and error-handling rules.

**Files:**
- Create: `web/src/app/core/money.ts`, `money.pipe.ts`
- Create: `web/src/app/core/problem-detail.ts`, `api-error.interceptor.ts`, `notification.service.ts`
- Modify: `web/src/app/app.config.ts` (register the interceptor)
- Test: `web/src/app/core/money.pipe.spec.ts`, `api-error.interceptor.spec.ts`

**Interfaces:**
- Produces:
  - `Money = { amount: string; currency: string }`
  - `formatMoney(money: Money, locale?: string): string`
  - `MoneyPipe` — `{{ salary | money }}`
  - `ProblemDetail`, `FieldError`, `ApiError` with `status`, `title`, `detail`, `fieldErrors`, `currentVersion`, `isConflict`
  - `apiErrorInterceptor` — an `HttpInterceptorFn`

- [ ] **Step 1: Write the failing test**

`web/src/app/core/money.pipe.spec.ts`
```ts
import { formatMoney } from './money';
import { MoneyPipe } from './money.pipe';

describe('formatMoney', () => {
  it('formats an amount with its own currency symbol', () => {
    expect(formatMoney({ amount: '125000.00', currency: 'USD' }, 'en-US')).toBe('$125,000.00');
  });

  it('formats a rupee amount in rupees, not in dollars', () => {
    const formatted = formatMoney({ amount: '3712500.00', currency: 'INR' }, 'en-IN');
    expect(formatted).toContain('₹');
    expect(formatted).not.toContain('$');
  });

  it('keeps full precision for an amount beyond the safe integer range', () => {
    // The guard against a double sneaking in: Number() would round this,
    // which is the double-for-money failure relocated to the browser.
    const formatted = formatMoney({ amount: '9007199254740993.00', currency: 'USD' }, 'en-US');
    expect(formatted).toContain('9,007,199,254,740,993');
  });

  it('returns an em dash for a missing amount rather than NaN', () => {
    expect(formatMoney(null, 'en-US')).toBe('—');
  });
});

describe('MoneyPipe', () => {
  it('delegates to formatMoney', () => {
    const pipe = new MoneyPipe('en-US');
    expect(pipe.transform({ amount: '1000.00', currency: 'USD' })).toBe('$1,000.00');
  });
});
```

`web/src/app/core/api-error.interceptor.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrorInterceptor } from './api-error.interceptor';
import { ApiError } from './problem-detail';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('turns a validation failure into field errors the form can bind to', done => {
    http.get('/api/employees').subscribe({
      error: (error: ApiError) => {
        expect(error.status).toBe(400);
        expect(error.fieldErrors).toEqual({ email: 'must be a well-formed email address' });
        done();
      },
    });

    mock.expectOne('/api/employees').flush(
      {
        title: 'Validation failed',
        detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
  });

  it('marks a stale-version response as a conflict and carries the current version', done => {
    http.put('/api/employees/1', {}).subscribe({
      error: (error: ApiError) => {
        expect(error.isConflict).toBe(true);
        expect(error.currentVersion).toBe(3);
        done();
      },
    });

    mock.expectOne('/api/employees/1').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );
  });

  it('describes a network failure in words the user can act on', done => {
    http.get('/api/employees').subscribe({
      error: (error: ApiError) => {
        expect(error.status).toBe(0);
        expect(error.detail).toContain('reach the server');
        done();
      },
    });

    mock.expectOne('/api/employees').error(new ProgressEvent('network error'));
  });

  it('leaves a successful response untouched', done => {
    http.get('/api/employees').subscribe(body => {
      expect(body).toEqual({ content: [] });
      done();
    });
    mock.expectOne('/api/employees').flush({ content: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — `./money` and `./problem-detail` do not exist.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/core/money.ts`
```ts
/**
 * Money arrives from the API as a string and stays one. A BigDecimal
 * serialized as a JSON number is parsed into a JavaScript double on arrival,
 * which is the double-for-money failure relocated to the browser.
 */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/**
 * Intl.NumberFormat accepts a string argument and formats it without going
 * through a double, which is why the string is passed straight through rather
 * than converted. No arithmetic happens here or anywhere else in the client -
 * every aggregate was already computed in SQL.
 */
export function formatMoney(money: Money | null | undefined, locale = 'en-US'): string {
  if (!money?.amount) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(money.amount as unknown as number);
}
```

`web/src/app/core/money.pipe.ts`
```ts
import { Inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { Money, formatMoney } from './money';

@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private readonly locale: string) {}

  transform(money: Money | null | undefined): string {
    return formatMoney(money, this.locale);
  }
}
```

`web/src/app/core/problem-detail.ts`
```ts
/** RFC 7807, as produced by Spring's ProblemDetail. */
export interface ProblemDetail {
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<{ field: string; message: string }>;
  readonly currentVersion?: number;
}

export interface ApiError {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  /** Keyed by field name, ready to bind to form controls. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly currentVersion?: number;
  readonly isConflict: boolean;
}
```

`web/src/app/core/api-error.interceptor.ts`
```ts
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError, ProblemDetail } from './problem-detail';

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((response: HttpErrorResponse) => throwError(() => toApiError(response))),
  );

function toApiError(response: HttpErrorResponse): ApiError {
  // status 0 means the request never reached the server - a different problem
  // from anything the server said, and a different message to the user.
  if (response.status === 0) {
    return {
      status: 0,
      title: 'Cannot reach the server',
      detail: 'We could not reach the server. Check your connection and try again.',
      fieldErrors: {},
      isConflict: false,
    };
  }

  const problem: ProblemDetail = response.error ?? {};
  const fieldErrors: Record<string, string> = {};
  for (const error of problem.errors ?? []) {
    fieldErrors[error.field] = error.message;
  }

  return {
    status: response.status,
    title: problem.title ?? 'Something went wrong',
    detail: problem.detail ?? 'The request could not be completed.',
    fieldErrors,
    currentVersion: problem.currentVersion,
    isConflict: response.status === 409,
  };
}
```

`web/src/app/core/notification.service.ts`
```ts
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from './problem-detail';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }

  /**
   * Field-level errors are bound to form controls by the caller, so only the
   * rest reach the snackbar. A 409 is never announced here - it needs a reload
   * prompt, not a transient toast.
   */
  notifyError(error: ApiError): void {
    if (Object.keys(error.fieldErrors).length > 0 || error.isConflict) {
      return;
    }
    this.snackBar.open(error.detail, 'Dismiss', { duration: 6000 });
  }
}
```

`web/src/app/app.config.ts` — register the interceptor:
```ts
import { apiErrorInterceptor } from './core/api-error.interceptor';
// ...
    provideHttpClient(withInterceptors([apiErrorInterceptor])),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 9 tests.

If the precision test fails, the runtime's `Intl.NumberFormat` does not accept string input. Do **not** fall back to `Number(money.amount)` — that reintroduces exactly the failure the test exists to catch. Write a digit-grouping formatter over the string instead and keep the test.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/core web/src/app/app.config.ts
git commit -m "feat: add money formatting and typed API errors

Amounts are formatted from their string form without passing through a
double. A test formats a value beyond the safe integer range, so a
regression to Number() fails the build rather than silently rounding
someone's salary.

Errors become a typed shape carrying field errors ready to bind to form
controls, with conflicts flagged separately - a 409 needs a reload
prompt, not a toast."
```

---

### Task 3: Employee API service and the list store

All the list's behaviour lives here — filtering, paging, sorting, debouncing and request cancellation — with no UI attached, so it is testable without a DOM. Implements spec §10's state section.

**The one that matters:** typing "John" quickly can let the response for "Jo" resolve *after* the response for "John", repainting the table with results for a query the user has already left. `switchMap` cancels the in-flight request on every change. It is invisible until a slow connection surfaces it, so it gets its own test.

**Files:**
- Create: `web/src/app/shared/request-state.ts`
- Create: `web/src/app/employees/employee.models.ts`, `employee-api.service.ts`, `employee-list.store.ts`
- Test: `web/src/app/employees/employee-list.store.spec.ts`

**Interfaces:**
- Produces:
  - `RequestState<T>` = `{status:'loading'} | {status:'error', error: ApiError} | {status:'ready', data: T}`
  - `EmployeeApiService.list(query)`, `.get(id)`, `.create(body)`, `.update(id, body)`, `.deactivate(id)`, `.remove(id)`, `.salaryHistory(id)`, `.recordRaise(id, body)`
  - `EmployeeListStore` — signals `search`, `country`, `department`, `level`, `status`, `page`, `size`, `sort`, `direction`; computed `query`, `state`; methods `setSearch`, `setFilter`, `setPage`, `setSort`, `toQueryParams()`, `applyQueryParams()`

- [ ] **Step 1: Write the failing test**

`web/src/app/employees/employee-list.store.spec.ts`
```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeListStore } from './employee-list.store';
import { EmployeePage } from './employee.models';

function pageOf(...names: string[]): EmployeePage {
  return {
    content: names.map((fullName, i) => ({
      id: i + 1,
      employeeNumber: `E-${i + 1}`,
      fullName,
      email: `${fullName.replace(' ', '.').toLowerCase()}@acme.test`,
      department: 'ENGINEERING',
      countryCode: 'IN',
      role: 'SOFTWARE_ENGINEER',
      level: 'SENIOR',
      status: 'ACTIVE',
      salary: { amount: '3712500.00', currency: 'INR' },
      salaryBaseUsd: { amount: '44550.00', currency: 'USD' },
      compaRatio: '1.0000',
    })),
    page: 0,
    size: 25,
    totalElements: names.length,
    totalPages: 1,
  };
}

describe('EmployeeListStore', () => {
  let store: EmployeeListStore;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(EmployeeListStore);
    mock = TestBed.inject(HttpTestingController);
  });

  it('requests the first page with the default sort on creation', fakeAsync(() => {
    tick(300);
    const request = mock.expectOne(r => r.url === '/api/employees');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('25');
    expect(request.request.params.get('sort')).toBe('FULL_NAME');
    request.flush(pageOf('Asha Menon'));
  }));

  it('cancels a superseded search rather than rendering a query the user has left', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setSearch('Jo');
    tick(300);
    const stale = mock.expectOne(r => r.request.params.get('q') === 'Jo');

    store.setSearch('John');
    tick(300);
    const current = mock.expectOne(r => r.request.params.get('q') === 'John');

    // The first request is unsubscribed by switchMap, so a late response for
    // "Jo" can never repaint the table.
    expect(stale.cancelled).toBe(true);

    current.flush(pageOf('John Carter'));
    const state = store.state();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && state.data.content[0].fullName).toBe('John Carter');
  }));

  it('waits for typing to settle before asking the server', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setSearch('J');
    tick(100);
    store.setSearch('Jo');
    tick(100);
    store.setSearch('Joh');
    tick(300);

    // One request for the settled text, not three for the keystrokes.
    const requests = mock.match(r => r.url === '/api/employees');
    expect(requests.length).toBe(1);
    expect(requests[0].request.params.get('q')).toBe('Joh');
    requests[0].flush(pageOf());
  }));

  it('returns to the first page whenever a filter changes', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setPage(4);
    tick(300);
    mock.expectOne(r => r.request.params.get('page') === '4').flush(pageOf());

    store.setFilter('country', 'IN');
    tick(300);

    // Staying on page 5 of a narrower result set would show an empty table.
    const request = mock.expectOne(r => r.request.params.get('country') === 'IN');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(pageOf());
  }));

  it('keeps the current page when only the page changes', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setPage(2);
    tick(300);
    mock.expectOne(r => r.request.params.get('page') === '2').flush(pageOf());
    expect(store.page()).toBe(2);
  }));

  it('omits filters that are not set rather than sending empty strings', fakeAsync(() => {
    tick(300);
    const request = mock.expectOne(r => r.url === '/api/employees');
    expect(request.request.params.has('country')).toBe(false);
    expect(request.request.params.has('q')).toBe(false);
    request.flush(pageOf());
  }));

  it('exposes a loading state before the first response arrives', () => {
    expect(store.state().status).toBe('loading');
  });

  it('exposes an error state the screen can render', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(
      { title: 'Something went wrong', detail: 'The request could not be completed.' },
      { status: 500, statusText: 'Server Error' },
    );

    const state = store.state();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error.status).toBe(500);
  }));

  it('round-trips its state through url query parameters', fakeAsync(() => {
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setFilter('country', 'IN');
    store.setFilter('level', 'SENIOR');
    store.setSort('SALARY', 'desc');
    store.setPage(3);
    tick(300);
    mock.match(r => r.url === '/api/employees').forEach(r => r.flush(pageOf()));

    const params = store.toQueryParams();
    expect(params).toEqual({ country: 'IN', level: 'SENIOR', sort: 'SALARY', direction: 'desc', page: 3 });

    // Clear everything, then restore from the params alone - the round trip a
    // bookmarked URL actually makes. (TestBed.inject would hand back the same
    // root singleton, so asking it for a "fresh" store would test nothing.)
    store.applyQueryParams({});
    expect(store.country()).toBeNull();
    expect(store.sort()).toBe('FULL_NAME');

    store.applyQueryParams(params);
    expect(store.country()).toBe('IN');
    expect(store.level()).toBe('SENIOR');
    expect(store.sort()).toBe('SALARY');
    expect(store.direction()).toBe('desc');
    expect(store.page()).toBe(3);

    tick(300);
    mock.match(() => true).forEach(r => r.flush(pageOf()));
  }));

  afterEach(() => mock.verify());
});
```

Note on `fakeAsync`: the application runs zoneless, but `jest-preset-angular` still loads `zone.js/testing`, so `fakeAsync`/`tick` remain available in tests. That is deliberate — it lets the debounce and cancellation be driven deterministically rather than with real timers.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — `EmployeeListStore` does not exist.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/shared/request-state.ts`
```ts
import { ApiError } from '../core/problem-detail';

/**
 * Loading, error and ready are distinct states because they need distinct
 * messages. "No employees match these filters" and "we couldn't reach the
 * server" are different things; a spinner that never resolves is worse than both.
 * Empty is derived from ready, not modelled separately.
 */
export type RequestState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: T };

export const loading = <T>(): RequestState<T> => ({ status: 'loading' });
export const ready = <T>(data: T): RequestState<T> => ({ status: 'ready', data });
export const failed = <T>(error: ApiError): RequestState<T> => ({ status: 'error', error });
```

`web/src/app/employees/employee.models.ts`
```ts
import { Money } from '../core/money';

export type EmployeeSort =
  | 'FULL_NAME' | 'HIRE_DATE' | 'SALARY' | 'COUNTRY' | 'DEPARTMENT' | 'LEVEL' | 'COMPA_RATIO';

export type SortDirection = 'asc' | 'desc';
export type FilterKey = 'country' | 'department' | 'level' | 'status';

export interface EmployeeListItem {
  readonly id: number;
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly email: string;
  readonly department: string;
  readonly countryCode: string;
  readonly role: string;
  readonly level: string;
  readonly status: string;
  readonly salary: Money;
  readonly salaryBaseUsd: Money;
  /** A string, like money: it is a decimal the server computed, not a number to do maths with. */
  readonly compaRatio?: string;
}

export interface EmployeePage {
  readonly content: ReadonlyArray<EmployeeListItem>;
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface EmployeeDetail extends EmployeeListItem {
  readonly employmentType: string;
  readonly hireDate: string;
  readonly salaryEffectiveFrom: string;
  readonly bandMin?: Money;
  readonly bandMid?: Money;
  readonly bandMax?: Money;
  readonly employeeVersion: number;
  readonly salaryVersion: number;
}

export interface SalaryHistoryItem {
  readonly salary: Money;
  readonly salaryBaseUsd: Money;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly changeReason?: string;
}

export interface EmployeeQuery {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
  readonly q: string;
  readonly page: number;
  readonly size: number;
  readonly sort: EmployeeSort;
  readonly direction: SortDirection;
}

export interface UpdateEmployeeBody {
  readonly fullName: string;
  readonly email: string;
  readonly department: string;
  readonly role: string;
  readonly level: string;
  readonly employmentType: string;
  readonly employeeVersion: number;
}

export interface RecordRaiseBody {
  readonly salary: Money;
  readonly effectiveFrom: string;
  readonly changeReason?: string;
  readonly salaryVersion: number;
}
```

`web/src/app/employees/employee-api.service.ts`
```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  EmployeeDetail, EmployeePage, EmployeeQuery, RecordRaiseBody, SalaryHistoryItem, UpdateEmployeeBody,
} from './employee.models';

@Injectable({ providedIn: 'root' })
export class EmployeeApiService {
  private readonly http = inject(HttpClient);

  list(query: EmployeeQuery): Observable<EmployeePage> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort)
      .set('direction', query.direction);

    // Absent rather than empty: the server rejects an unparseable enum, and an
    // empty string is not a valid country.
    if (query.country) params = params.set('country', query.country);
    if (query.department) params = params.set('department', query.department);
    if (query.level) params = params.set('level', query.level);
    if (query.status) params = params.set('status', query.status);
    if (query.q.trim()) params = params.set('q', query.q.trim());

    return this.http.get<EmployeePage>('/api/employees', { params });
  }

  get(id: number): Observable<EmployeeDetail> {
    return this.http.get<EmployeeDetail>(`/api/employees/${id}`);
  }

  update(id: number, body: UpdateEmployeeBody): Observable<EmployeeDetail> {
    return this.http.put<EmployeeDetail>(`/api/employees/${id}`, body);
  }

  deactivate(id: number): Observable<EmployeeDetail> {
    return this.http.post<EmployeeDetail>(`/api/employees/${id}/deactivate`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/employees/${id}`);
  }

  salaryHistory(id: number): Observable<SalaryHistoryItem[]> {
    return this.http.get<SalaryHistoryItem[]>(`/api/employees/${id}/salary-history`);
  }

  recordRaise(id: number, body: RecordRaiseBody): Observable<unknown> {
    return this.http.post(`/api/employees/${id}/salary`, body);
  }
}
```

`web/src/app/employees/employee-list.store.ts`
```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../core/problem-detail';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { EmployeeApiService } from './employee-api.service';
import { EmployeePage, EmployeeQuery, EmployeeSort, FilterKey, SortDirection } from './employee.models';

const DEBOUNCE_MS = 300;

@Injectable({ providedIn: 'root' })
export class EmployeeListStore {
  private readonly api = inject(EmployeeApiService);

  readonly search = signal('');
  readonly country = signal<string | null>(null);
  readonly department = signal<string | null>(null);
  readonly level = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly page = signal(0);
  readonly size = signal(25);
  readonly sort = signal<EmployeeSort>('FULL_NAME');
  readonly direction = signal<SortDirection>('asc');

  /** Only the search box is debounced. A filter chip or page click is deliberate and immediate. */
  private readonly settledSearch = toSignal(
    toObservable(this.search).pipe(debounceTime(DEBOUNCE_MS), distinctUntilChanged()),
    { initialValue: '' },
  );

  readonly query = computed<EmployeeQuery>(() => ({
    country: this.country(),
    department: this.department(),
    level: this.level(),
    status: this.status(),
    q: this.settledSearch(),
    page: this.page(),
    size: this.size(),
    sort: this.sort(),
    direction: this.direction(),
  }));

  /**
   * switchMap is the frontend's race condition, closed. Without it a slow
   * response for an abandoned query can resolve last and repaint the table.
   */
  readonly state = toSignal<RequestState<EmployeePage>>(
    toObservable(this.query).pipe(
      switchMap(query =>
        this.api.list(query).pipe(
          map(page => ready(page)),
          catchError((error: ApiError) => of(failed<EmployeePage>(error))),
          startWith(loading<EmployeePage>()),
        ),
      ),
    ),
    { initialValue: loading<EmployeePage>() },
  );

  readonly totalElements = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data.totalElements : 0;
  });

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(0);
  }

  setFilter(key: FilterKey, value: string | null): void {
    this[key].set(value);
    // Narrowing the result set while on page 5 would show an empty table.
    this.page.set(0);
  }

  setSort(sort: EmployeeSort, direction: SortDirection): void {
    this.sort.set(sort);
    this.direction.set(direction);
    this.page.set(0);
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setSize(size: number): void {
    this.size.set(size);
    this.page.set(0);
  }

  /** Only non-default values, so a clean list has a clean URL. */
  toQueryParams(): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    if (this.country()) params['country'] = this.country()!;
    if (this.department()) params['department'] = this.department()!;
    if (this.level()) params['level'] = this.level()!;
    if (this.status()) params['status'] = this.status()!;
    if (this.search().trim()) params['q'] = this.search().trim();
    if (this.sort() !== 'FULL_NAME') params['sort'] = this.sort();
    if (this.direction() !== 'asc') params['direction'] = this.direction();
    if (this.page() !== 0) params['page'] = this.page();
    return params;
  }

  applyQueryParams(params: Record<string, unknown>): void {
    this.country.set((params['country'] as string) ?? null);
    this.department.set((params['department'] as string) ?? null);
    this.level.set((params['level'] as string) ?? null);
    this.status.set((params['status'] as string) ?? null);
    this.search.set((params['q'] as string) ?? '');
    this.sort.set((params['sort'] as EmployeeSort) ?? 'FULL_NAME');
    this.direction.set((params['direction'] as SortDirection) ?? 'asc');
    this.page.set(Number(params['page'] ?? 0));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 9 store tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/employees web/src/app/shared
git commit -m "feat: add employee list store with request cancellation

All list behaviour lives in signals with no DOM attached, so filtering,
paging and sorting are testable without a component.

switchMap cancels a superseded search: without it, a slow response for an
abandoned query can resolve last and repaint the table with results the
user has already moved past. A test asserts the stale request is
cancelled rather than merely ignored.

Only the search box is debounced - a filter chip or page click is a
deliberate act and should not wait."
```

---

### Task 4: Shared reference data, state panel, and filter bar

Three pieces both feature areas need. The filter bar is deliberately shared between the list and insights — same four dimensions, same options, one place to fix.

**Files:**
- Create: `web/src/app/shared/reference.ts`
- Create: `web/src/app/shared/state-panel.component.ts`
- Create: `web/src/app/employees/filter-bar.component.ts`
- Test: `web/src/app/shared/state-panel.component.spec.ts`, `web/src/app/employees/filter-bar.component.spec.ts`

**Interfaces:**
- Produces:
  - `COUNTRIES`, `DEPARTMENTS`, `ROLES`, `LEVELS`, `STATUSES`, `SORT_OPTIONS` — label/value pairs mirroring the backend enumerations.
  - `StatePanelComponent` — inputs `state: RequestState<unknown>`, `emptyMessage: string`, `isEmpty: boolean`; output `retry`.
  - `FilterBarComponent` — input `value: FilterValues`, input `showStatus = true`; output `changed: {key, value}`.
  - `FilterValues = { country, department, level, status }`, each `string | null`.

- [ ] **Step 1: Write the failing test**

`web/src/app/shared/state-panel.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { StatePanelComponent } from './state-panel.component';

describe('StatePanelComponent', () => {
  async function render(inputs: Record<string, unknown>) {
    await TestBed.configureTestingModule({ imports: [StatePanelComponent] }).compileComponents();
    const fixture = TestBed.createComponent(StatePanelComponent);
    Object.entries(inputs).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    fixture.detectChanges();
    return fixture;
  }

  it('shows a spinner while loading', async () => {
    const fixture = await render({ state: { status: 'loading' }, isEmpty: false, emptyMessage: '' });
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).toBeTruthy();
  });

  it('distinguishes an unreachable server from an empty result', async () => {
    const fixture = await render({
      state: { status: 'error', error: { status: 0, title: 'Cannot reach the server',
        detail: 'We could not reach the server. Check your connection and try again.',
        fieldErrors: {}, isConflict: false } },
      isEmpty: false,
      emptyMessage: 'No employees match these filters',
    });

    expect(fixture.nativeElement.textContent).toContain('reach the server');
    expect(fixture.nativeElement.textContent).not.toContain('No employees match');
  });

  it('offers a retry when the request failed', async () => {
    const fixture = await render({
      state: { status: 'error', error: { status: 500, title: 'Something went wrong',
        detail: 'The request could not be completed.', fieldErrors: {}, isConflict: false } },
      isEmpty: false, emptyMessage: '',
    });
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Try again');
  });

  it('shows the caller-supplied empty message when the result set is empty', async () => {
    const fixture = await render({
      state: { status: 'ready', data: {} }, isEmpty: true,
      emptyMessage: 'No employees match these filters',
    });
    expect(fixture.nativeElement.textContent).toContain('No employees match these filters');
  });

  it('renders nothing at all once there is data to show', async () => {
    const fixture = await render({
      state: { status: 'ready', data: {} }, isEmpty: false, emptyMessage: 'unused',
    });
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
```

`web/src/app/employees/filter-bar.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent', () => {
  async function render(showStatus = true) {
    await TestBed.configureTestingModule({ imports: [FilterBarComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.componentRef.setInput('value',
      { country: null, department: null, level: null, status: null });
    fixture.componentRef.setInput('showStatus', showStatus);
    fixture.detectChanges();
    return fixture;
  }

  it('offers all four filter dimensions', async () => {
    const fixture = await render();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('mat-label'))
      .map((el: any) => el.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['Country', 'Department', 'Level', 'Status']));
  });

  it('hides the status filter when the caller does not want it', async () => {
    const fixture = await render(false);
    const labels = Array.from(fixture.nativeElement.querySelectorAll('mat-label'))
      .map((el: any) => el.textContent.trim());
    expect(labels).not.toContain('Status');
  });

  it('emits the key and the value when a filter changes', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    fixture.componentInstance.onChange('country', 'IN');

    expect(emitted).toEqual([{ key: 'country', value: 'IN' }]);
  });

  it('emits null when a filter is cleared, never an empty string', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    fixture.componentInstance.onChange('level', '');

    // The server rejects an unparseable enum; an empty string is not a level.
    expect(emitted).toEqual([{ key: 'level', value: null }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — neither component exists.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/shared/reference.ts`
```ts
/** Mirrors the backend enumerations. Changing one without the other breaks filtering. */
export interface Option {
  readonly value: string;
  readonly label: string;
}

export const COUNTRIES: readonly Option[] = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'DE', label: 'Germany' },
  { value: 'SG', label: 'Singapore' },
  { value: 'BR', label: 'Brazil' },
];

export const DEPARTMENTS: readonly Option[] = [
  'ENGINEERING', 'PRODUCT', 'DESIGN', 'SALES', 'MARKETING', 'FINANCE', 'PEOPLE', 'SUPPORT',
].map(value => ({ value, label: titleCase(value) }));

export const ROLES: readonly Option[] = [
  'SOFTWARE_ENGINEER', 'DATA_ENGINEER', 'PRODUCT_MANAGER', 'DESIGNER', 'ACCOUNT_EXECUTIVE',
  'MARKETING_MANAGER', 'ACCOUNTANT', 'RECRUITER', 'SUPPORT_SPECIALIST',
].map(value => ({ value, label: titleCase(value) }));

export const LEVELS: readonly Option[] = ['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']
  .map(value => ({ value, label: titleCase(value) }));

export const STATUSES: readonly Option[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export const EMPLOYMENT_TYPES: readonly Option[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT']
  .map(value => ({ value, label: titleCase(value) }));

export const SORT_OPTIONS: readonly Option[] = [
  { value: 'FULL_NAME', label: 'Name' },
  { value: 'HIRE_DATE', label: 'Hire date' },
  { value: 'SALARY', label: 'Salary (USD)' },
  { value: 'COUNTRY', label: 'Country' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'LEVEL', label: 'Level' },
  { value: 'COMPA_RATIO', label: 'Compa-ratio' },
];

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

`web/src/app/shared/state-panel.component.ts`
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RequestState } from './request-state';

/**
 * Renders the three non-ready states and nothing else. The parent renders its
 * own content when there is data, so this never needs generic projection.
 */
@Component({
  selector: 'app-state-panel',
  standalone: true,
  imports: [MatProgressSpinnerModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().status === 'loading') {
      <div class="panel"><mat-progress-spinner mode="indeterminate" diameter="40" /></div>
    } @else if (state().status === 'error') {
      <div class="panel error" role="alert">
        <mat-icon>error_outline</mat-icon>
        <p>{{ errorDetail() }}</p>
        <button mat-stroked-button (click)="retry.emit()">Try again</button>
      </div>
    } @else if (isEmpty()) {
      <div class="panel empty"><mat-icon>inbox</mat-icon><p>{{ emptyMessage() }}</p></div>
    }
  `,
  styles: [`
    .panel { display: flex; flex-direction: column; align-items: center; gap: .75rem; padding: 3rem 1rem; }
    .error { color: var(--mat-sys-error, #b3261e); }
    p { margin: 0; text-align: center; }
  `],
})
export class StatePanelComponent {
  readonly state = input.required<RequestState<unknown>>();
  readonly isEmpty = input(false);
  readonly emptyMessage = input('Nothing to show');
  readonly retry = output<void>();

  errorDetail(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }
}
```

`web/src/app/employees/filter-bar.component.ts`
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { COUNTRIES, DEPARTMENTS, LEVELS, STATUSES } from '../shared/reference';

export interface FilterValues {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
}

export interface FilterChange {
  readonly key: keyof FilterValues;
  readonly value: string | null;
}

/**
 * Shared by the employee list and the insights screen. Same four dimensions,
 * same options, same validation - one place to change them.
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Country</mat-label>
        <mat-select [value]="value().country" (valueChange)="onChange('country', $event)">
          <mat-option [value]="''">All countries</mat-option>
          @for (option of countries; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Department</mat-label>
        <mat-select [value]="value().department" (valueChange)="onChange('department', $event)">
          <mat-option [value]="''">All departments</mat-option>
          @for (option of departments; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Level</mat-label>
        <mat-select [value]="value().level" (valueChange)="onChange('level', $event)">
          <mat-option [value]="''">All levels</mat-option>
          @for (option of levels; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (showStatus()) {
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [value]="value().status" (valueChange)="onChange('status', $event)">
            <mat-option [value]="''">Active and inactive</mat-option>
            @for (option of statuses; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; gap: 1rem; }
    mat-form-field { min-width: 12rem; flex: 1 1 12rem; }
  `],
})
export class FilterBarComponent {
  readonly value = input.required<FilterValues>();
  readonly showStatus = input(true);
  readonly changed = output<FilterChange>();

  protected readonly countries = COUNTRIES;
  protected readonly departments = DEPARTMENTS;
  protected readonly levels = LEVELS;
  protected readonly statuses = STATUSES;

  onChange(key: keyof FilterValues, value: string): void {
    // Empty means "no filter", and the server would reject an empty enum.
    this.changed.emit({ key, value: value === '' ? null : value });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/shared web/src/app/employees/filter-bar.component.ts \
        web/src/app/employees/filter-bar.component.spec.ts
git commit -m "feat: add shared reference data, state panel and filter bar

The state panel keeps loading, error and empty as distinct messages: an
unreachable server and a filter that matched nothing are different
problems and should not read the same.

The filter bar is shared by the employee list and insights so the four
dimensions cannot drift apart, and clearing a filter emits null rather
than an empty string, which the server would reject as an invalid enum."
```

---

### Task 5: The employee list screen

Implements spec §10's list screen and the URL-as-source-of-truth rule.

**Files:**
- Replace: `web/src/app/employees/employee-list.component.ts` (the Task 1 placeholder)
- Test: `web/src/app/employees/employee-list.component.spec.ts`

**Interfaces:**
- Consumes: `EmployeeListStore` (Task 3), `FilterBarComponent`, `StatePanelComponent` (Task 4), `MoneyPipe` (Task 2).
- Produces: `EmployeeListComponent` at route `/employees`.

- [ ] **Step 1: Write the failing test**

`web/src/app/employees/employee-list.component.spec.ts`
```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Location } from '@angular/common';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeListComponent } from './employee-list.component';
import { EmployeeListStore } from './employee-list.store';
import { EmployeePage } from './employee.models';

const PAGE: EmployeePage = {
  content: [
    {
      id: 1, employeeNumber: 'E-001', fullName: 'Asha Menon', email: 'asha@acme.test',
      department: 'ENGINEERING', countryCode: 'IN', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
      status: 'ACTIVE', salary: { amount: '3712500.00', currency: 'INR' },
      salaryBaseUsd: { amount: '44550.00', currency: 'USD' }, compaRatio: '1.0000',
    },
    {
      id: 2, employeeNumber: 'E-002', fullName: 'Ben Carter', email: 'ben@acme.test',
      department: 'ENGINEERING', countryCode: 'GB', role: 'SOFTWARE_ENGINEER', level: 'MID',
      status: 'ACTIVE', salary: { amount: '100000.00', currency: 'GBP' },
      salaryBaseUsd: { amount: '127000.00', currency: 'USD' }, compaRatio: '0.7000',
    },
  ],
  page: 0, size: 25, totalElements: 42, totalPages: 2,
};

describe('EmployeeListComponent', () => {
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([{ path: 'employees', component: EmployeeListComponent }]),
      ],
    });
    mock = TestBed.inject(HttpTestingController);
  });

  async function open(url = '/employees') {
    const harness = await RouterTestingHarness.create(url);
    return harness;
  }

  it('shows each salary in its own currency alongside the USD equivalent', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    const text = harness.routeNativeElement!.textContent!;
    expect(text).toContain('Asha Menon');
    expect(text).toContain('₹');          // original currency
    expect(text).toContain('$44,550.00'); // USD equivalent, side by side
  }));

  it('flags an employee outside the band so the row is scannable', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    const outOfBand = harness.routeNativeElement!.querySelectorAll('.compa-ratio.out-of-band');
    expect(outOfBand.length).toBe(1); // Ben at 0.70, not Asha at 1.00
  }));

  it('reports the server-side total rather than the number of rows on screen', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    expect(harness.routeNativeElement!.querySelector('mat-paginator')!.textContent)
      .toContain('42');
  }));

  it('restores filters from the url so a filtered view can be shared', fakeAsync(async () => {
    await open('/employees?country=IN&level=SENIOR&sort=SALARY&direction=desc');
    tick(300);

    const request = mock.expectOne(r => r.url === '/api/employees');
    expect(request.request.params.get('country')).toBe('IN');
    expect(request.request.params.get('level')).toBe('SENIOR');
    expect(request.request.params.get('sort')).toBe('SALARY');
    expect(request.request.params.get('direction')).toBe('desc');
    request.flush(PAGE);
  }));

  it('writes filters back to the url so refresh and the back button behave', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);

    TestBed.inject(EmployeeListStore).setFilter('country', 'IN');
    tick(300);
    mock.match(r => r.url === '/api/employees').forEach(r => r.flush(PAGE));
    harness.detectChanges();
    tick();

    expect(TestBed.inject(Location).path()).toContain('country=IN');
  }));

  it('says no employees matched rather than showing an empty table', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees')
      .flush({ ...PAGE, content: [], totalElements: 0, totalPages: 0 });
    harness.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('No employees match these filters');
  }));

  it('says the server is unreachable when the request never landed', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').error(new ProgressEvent('network error'));
    harness.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('reach the server');
  }));

  afterEach(() => mock.verify());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — the placeholder component renders none of this.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/employees/employee-list.component.ts`
```ts
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { take } from 'rxjs';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { SORT_OPTIONS, titleCase } from '../shared/reference';
import { FilterBarComponent, FilterChange } from './filter-bar.component';
import { EmployeeListStore } from './employee-list.store';
import { EmployeeSort, SortDirection } from './employee.models';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    RouterLink, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MoneyPipe, StatePanelComponent, FilterBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Employees</h1>

    <mat-form-field appearance="outline" class="search">
      <mat-label>Search name, email or employee number</mat-label>
      <input matInput [value]="store.search()" (input)="onSearch($event)" />
    </mat-form-field>

    <app-filter-bar [value]="filters()" (changed)="onFilterChange($event)" />

    <mat-form-field appearance="outline" class="sort">
      <mat-label>Sort by</mat-label>
      <mat-select [value]="store.sort()" (valueChange)="onSort($event)">
        @for (option of sortOptions; track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <app-state-panel
      [state]="store.state()"
      [isEmpty]="rows().length === 0"
      emptyMessage="No employees match these filters"
      (retry)="store.setPage(store.page())" />

    @if (rows().length > 0) {
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let row">
            <a [routerLink]="['/employees', row.id]">{{ row.fullName }}</a>
            <span class="muted">{{ row.employeeNumber }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="role">
          <th mat-header-cell *matHeaderCellDef>Role</th>
          <td mat-cell *matCellDef="let row">
            {{ label(row.role) }}<span class="muted">{{ label(row.level) }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="country">
          <th mat-header-cell *matHeaderCellDef>Country</th>
          <td mat-cell *matCellDef="let row">{{ row.countryCode }}</td>
        </ng-container>

        <ng-container matColumnDef="salary">
          <th mat-header-cell *matHeaderCellDef>Salary</th>
          <td mat-cell *matCellDef="let row">
            {{ row.salary | money }}<span class="muted">{{ row.salaryBaseUsd | money }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="compaRatio">
          <th mat-header-cell *matHeaderCellDef>Compa-ratio</th>
          <td mat-cell *matCellDef="let row">
            @if (row.compaRatio) {
              <span class="compa-ratio" [class.out-of-band]="outOfBand(row.compaRatio)">
                {{ row.compaRatio }}
              </span>
            } @else {
              <span class="muted" title="No pay band exists for this role, level and country">
                No band
              </span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let row">{{ label(row.status) }}</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    }

    <mat-paginator
      [length]="store.totalElements()"
      [pageIndex]="store.page()"
      [pageSize]="store.size()"
      [pageSizeOptions]="[10, 25, 50, 100]"
      (page)="onPage($event)" />
  `,
  styles: [`
    .search { width: 100%; max-width: 32rem; }
    .sort { min-width: 14rem; margin-top: .5rem; }
    table { width: 100%; margin-top: 1rem; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
    .compa-ratio { font-variant-numeric: tabular-nums; }
    .out-of-band { color: var(--mat-sys-error, #b3261e); font-weight: 600; }
  `],
})
export class EmployeeListComponent {
  protected readonly store = inject(EmployeeListStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly columns = ['name', 'role', 'country', 'salary', 'compaRatio', 'status'];
  protected readonly label = titleCase;

  constructor() {
    // Read once on entry so a shared or bookmarked URL restores its view...
    this.route.queryParams.pipe(take(1)).subscribe(params => this.store.applyQueryParams(params));

    // ...then keep the URL in step, replacing rather than pushing so the back
    // button leaves the list instead of walking through every filter change.
    effect(() => {
      const queryParams = this.store.toQueryParams();
      void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
    });
  }

  protected rows() {
    const state = this.store.state();
    return state.status === 'ready' ? state.data.content : [];
  }

  protected filters() {
    return {
      country: this.store.country(),
      department: this.store.department(),
      level: this.store.level(),
      status: this.store.status(),
    };
  }

  /** A ratio is a decimal string; comparing as a number here is display logic, not money maths. */
  protected outOfBand(compaRatio: string): boolean {
    const value = Number(compaRatio);
    return value < 0.8 || value > 1.2;
  }

  protected onSearch(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  protected onFilterChange(change: FilterChange): void {
    this.store.setFilter(change.key, change.value);
  }

  protected onSort(sort: EmployeeSort): void {
    this.store.setSort(sort, this.store.direction() as SortDirection);
  }

  protected onPage(event: PageEvent): void {
    if (event.pageSize !== this.store.size()) {
      this.store.setSize(event.pageSize);
    } else {
      this.store.setPage(event.pageIndex);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/employees/employee-list.component.ts \
        web/src/app/employees/employee-list.component.spec.ts
git commit -m "feat: add the employee list screen

Every row shows pay in the employee's own currency and in USD, because
one answers what they are paid and the other is the only figure
comparable across the organization.

List state round-trips through the URL, so a filtered view can be
bookmarked or pasted to a colleague and a refresh keeps its place.
Navigation replaces rather than pushes, so the back button leaves the
list instead of walking back through every filter change."
```

---

### Task 6: Employee detail, editing, and the conflict path

Implements spec §10's detail screen. The 409 handling is the part worth care: silently retrying an optimistic-lock failure re-creates exactly the lost update the version exists to prevent.

**Files:**
- Create: `web/src/app/employees/employee-detail.store.ts`
- Replace: `web/src/app/employees/employee-detail.component.ts` (the Task 1 placeholder)
- Test: `web/src/app/employees/employee-detail.store.spec.ts`, `employee-detail.component.spec.ts`

**Interfaces:**
- Produces:
  - `EmployeeDetailStore` — provided at component level so navigating away resets it. Signals `state`, `saving`, `conflict`, `fieldErrors`. Methods `load(id)`, `save(id, body)`, `deactivate(id)`, `remove(id)`.
  - `EmployeeDetailComponent` at route `/employees/:id`.

- [ ] **Step 1: Write the failing test**

`web/src/app/employees/employee-detail.store.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeDetailStore } from './employee-detail.store';
import { EmployeeDetail, UpdateEmployeeBody } from './employee.models';

const DETAIL: EmployeeDetail = {
  id: 7, employeeNumber: 'E-007', fullName: 'Asha Menon', email: 'asha@acme.test',
  department: 'ENGINEERING', countryCode: 'IN', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
  employmentType: 'FULL_TIME', hireDate: '2024-03-01', status: 'ACTIVE',
  salary: { amount: '3712500.00', currency: 'INR' },
  salaryBaseUsd: { amount: '44550.00', currency: 'USD' },
  salaryEffectiveFrom: '2024-03-01', compaRatio: '1.0000',
  bandMin: { amount: '2970000.00', currency: 'INR' },
  bandMid: { amount: '3712500.00', currency: 'INR' },
  bandMax: { amount: '4640625.00', currency: 'INR' },
  employeeVersion: 0, salaryVersion: 0,
};

const EDIT: UpdateEmployeeBody = {
  fullName: 'Asha Menon-Rao', email: 'asha@acme.test', department: 'ENGINEERING',
  role: 'SOFTWARE_ENGINEER', level: 'STAFF', employmentType: 'FULL_TIME', employeeVersion: 0,
};

describe('EmployeeDetailStore', () => {
  let store: EmployeeDetailStore;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmployeeDetailStore,
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(EmployeeDetailStore);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('loads the record and exposes both version tokens', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    const state = store.state();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && state.data.employeeVersion).toBe(0);
    expect(state.status === 'ready' && state.data.salaryVersion).toBe(0);
  });

  it('sends the employee version when saving, never the salary version', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    const request = mock.expectOne(r => r.method === 'PUT');
    expect(request.request.body.employeeVersion).toBe(0);
    expect(request.request.body.salaryVersion).toBeUndefined();
    request.flush({ ...DETAIL, fullName: 'Asha Menon-Rao', level: 'STAFF', employeeVersion: 1 });
  });

  it('adopts the version the server returns so the next save is not stale', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush({ ...DETAIL, employeeVersion: 1 });

    const state = store.state();
    expect(state.status === 'ready' && state.data.employeeVersion).toBe(1);
  });

  it('raises a conflict rather than retrying when the record changed underneath', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );

    // Silently retrying with the fresh version would re-create the lost update
    // the version exists to prevent.
    expect(store.conflict()).toBe(true);
    expect(store.saving()).toBe(false);
    mock.expectNone(r => r.method === 'PUT');
  });

  it('surfaces field errors so the form can highlight the offending input', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, { ...EDIT, email: 'not-an-email' });
    mock.expectOne(r => r.method === 'PUT').flush(
      {
        title: 'Validation failed', detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(store.fieldErrors()['email']).toBe('must be a well-formed email address');
    expect(store.conflict()).toBe(false);
  });

  it('clears a previous conflict when the record is reloaded', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);
    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush({}, { status: 409, statusText: 'Conflict' });
    expect(store.conflict()).toBe(true);

    store.load(7);
    mock.expectOne('/api/employees/7').flush({ ...DETAIL, employeeVersion: 3 });

    expect(store.conflict()).toBe(false);
  });

  it('reports a missing employee as not found rather than an empty record', () => {
    store.load(999);
    mock.expectOne('/api/employees/999').flush(
      { title: 'Not found', detail: 'No employee with id 999' },
      { status: 404, statusText: 'Not Found' },
    );

    const state = store.state();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error.status).toBe(404);
  });

  it('deactivates without sending any version token', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.deactivate(7);
    const request = mock.expectOne('/api/employees/7/deactivate');
    // Deactivation is a transition to a fixed target state, not a
    // read-modify-write, so there is no lost update to guard against.
    expect(request.request.body).toEqual({});
    request.flush({ ...DETAIL, status: 'INACTIVE', employeeVersion: 1 });

    const state = store.state();
    expect(state.status === 'ready' && state.data.status).toBe('INACTIVE');
  });
});
```

`web/src/app/employees/employee-detail.component.spec.ts`
```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeDetailComponent } from './employee-detail.component';

const DETAIL = {
  id: 7, employeeNumber: 'E-007', fullName: 'Asha Menon', email: 'asha@acme.test',
  department: 'ENGINEERING', countryCode: 'IN', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
  employmentType: 'FULL_TIME', hireDate: '2024-03-01', status: 'ACTIVE',
  salary: { amount: '3712500.00', currency: 'INR' },
  salaryBaseUsd: { amount: '44550.00', currency: 'USD' },
  salaryEffectiveFrom: '2024-03-01', compaRatio: '1.0000',
  bandMin: { amount: '2970000.00', currency: 'INR' },
  bandMid: { amount: '3712500.00', currency: 'INR' },
  bandMax: { amount: '4640625.00', currency: 'INR' },
  employeeVersion: 0, salaryVersion: 0,
};

describe('EmployeeDetailComponent', () => {
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([{ path: 'employees/:id', component: EmployeeDetailComponent }]),
      ],
    });
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('explains the compa-ratio next to the band it was measured against', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    const text = harness.routeNativeElement!.textContent!;
    // The number and its explanation belong together, not in a legend elsewhere.
    expect(text).toContain('1.0000');
    expect(text).toContain('₹3,712,500.00'); // band midpoint
  }));

  it('offers a reload rather than retrying when the record changed underneath', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    harness.routeDebugElement!.componentInstance.onSave();
    mock.expectOne(r => r.method === 'PUT').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );
    harness.detectChanges();
    tick();

    const banner = harness.routeNativeElement!.querySelector('[role="alert"]')!;
    expect(banner.textContent).toContain('changed since you opened it');
    expect(banner.querySelector('button')!.textContent).toContain('Reload');
  }));

  it('does not fetch the salary history until the timeline tab is opened', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    mock.expectNone('/api/employees/7/salary-history');
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — `EmployeeDetailStore` does not exist.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/employees/employee-detail.store.ts`
```ts
import { Injectable, inject, signal } from '@angular/core';
import { ApiError } from '../core/problem-detail';
import { NotificationService } from '../core/notification.service';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { EmployeeApiService } from './employee-api.service';
import { EmployeeDetail, UpdateEmployeeBody } from './employee.models';

/**
 * Provided at component level, not root, so navigating between employees starts
 * clean rather than briefly showing the previous person's record.
 */
@Injectable()
export class EmployeeDetailStore {
  private readonly api = inject(EmployeeApiService);
  private readonly notifications = inject(NotificationService);

  readonly state = signal<RequestState<EmployeeDetail>>(loading());
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});

  load(id: number): void {
    this.state.set(loading());
    this.conflict.set(false);
    this.fieldErrors.set({});
    this.api.get(id).subscribe({
      next: detail => this.state.set(ready(detail)),
      error: (error: ApiError) => this.state.set(failed(error)),
    });
  }

  save(id: number, body: UpdateEmployeeBody): void {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.api.update(id, body).subscribe({
      next: detail => {
        // Adopt the returned version, or the next save would be stale.
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Changes saved');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  deactivate(id: number): void {
    this.saving.set(true);
    this.api.deactivate(id).subscribe({
      next: detail => {
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Employee deactivated');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  remove(id: number): void {
    this.saving.set(true);
    this.api.remove(id).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.notify('Employee deleted');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  private onWriteFailed(error: ApiError): void {
    this.saving.set(false);
    this.fieldErrors.set(error.fieldErrors);
    // A conflict is never retried. Re-sending with the fresh version would
    // overwrite whatever the other writer just saved - exactly the lost update
    // the version exists to prevent.
    this.conflict.set(error.isConflict);
    this.notifications.notifyError(error);
  }
}
```

**Forward reference:** the template below imports `SalaryHistoryComponent`, which Task 7 builds. Create a placeholder now — a standalone component with an `employeeId` input that renders nothing — or this task will not compile. Task 7 replaces it.

`web/src/app/employees/employee-detail.component.ts`
```ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { DEPARTMENTS, EMPLOYMENT_TYPES, LEVELS, ROLES, titleCase } from '../shared/reference';
import { SalaryHistoryComponent } from './salary-history.component';
import { EmployeeDetailStore } from './employee-detail.store';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatTabsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MoneyPipe, StatePanelComponent, SalaryHistoryComponent,
  ],
  providers: [EmployeeDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/employees">Back to employees</a>

    <app-state-panel [state]="store.state()" (retry)="store.load(+id())" />

    @if (employee(); as person) {
      <h1>{{ person.fullName }}</h1>

      @if (store.conflict()) {
        <div class="conflict" role="alert">
          <span>This record changed since you opened it. Reload to see the current values.</span>
          <button mat-stroked-button (click)="store.load(+id())">Reload</button>
        </div>
      }

      <mat-tab-group>
        <mat-tab label="Details">
          <mat-card>
            <mat-form-field appearance="outline">
              <mat-label>Full name</mat-label>
              <input matInput [(ngModel)]="form.fullName" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput [(ngModel)]="form.email" />
              @if (store.fieldErrors()['email']; as message) {
                <mat-error>{{ message }}</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Department</mat-label>
              <mat-select [(ngModel)]="form.department">
                @for (option of departments; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Role</mat-label>
              <mat-select [(ngModel)]="form.role">
                @for (option of roles; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Level</mat-label>
              <mat-select [(ngModel)]="form.level">
                @for (option of levels; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Employment type</mat-label>
              <mat-select [(ngModel)]="form.employmentType">
                @for (option of employmentTypes; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <div class="actions">
              <button mat-flat-button [disabled]="store.saving()" (click)="onSave()">Save</button>
              <button mat-stroked-button [disabled]="store.saving()"
                      (click)="store.deactivate(+id())">Deactivate</button>
            </div>
          </mat-card>

          <mat-card class="pay">
            <h2>Current pay</h2>
            <p class="figure">{{ person.salary | money }}</p>
            <p class="muted">{{ person.salaryBaseUsd | money }} at the recorded rate</p>

            @if (person.bandMid) {
              <p>
                Compa-ratio <strong>{{ person.compaRatio }}</strong>
                against a band midpoint of {{ person.bandMid | money }}
                (range {{ person.bandMin | money }} to {{ person.bandMax | money }}).
              </p>
            } @else {
              <p class="muted">
                No pay band exists for {{ label(person.role) }} at {{ label(person.level) }} in
                {{ person.countryCode }}, so no compa-ratio can be calculated.
              </p>
            }
          </mat-card>
        </mat-tab>

        <mat-tab label="Salary history">
          <ng-template matTabContent>
            <app-salary-history [employeeId]="+id()" />
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .conflict { display: flex; align-items: center; gap: 1rem; padding: .75rem 1rem;
                border: 1px solid var(--mat-sys-error, #b3261e); border-radius: 4px; margin: 1rem 0; }
    mat-card { padding: 1.5rem; margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; }
    mat-form-field { flex: 1 1 16rem; }
    .actions { flex-basis: 100%; display: flex; gap: .75rem; }
    .pay { display: block; }
    .figure { font-size: 1.75rem; margin: .25rem 0; }
    .muted { opacity: .7; }
  `],
})
export class EmployeeDetailComponent {
  /** Bound from the route by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly store = inject(EmployeeDetailStore);
  protected readonly departments = DEPARTMENTS;
  protected readonly roles = ROLES;
  protected readonly levels = LEVELS;
  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly label = titleCase;

  protected form = {
    fullName: '', email: '', department: '', role: '', level: '', employmentType: '',
  };

  protected readonly employee = computed(() => {
    const state = this.store.state();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    // Load when the route id arrives, and refill the form whenever the record
    // is replaced - including after a save, which returns the new version.
    let lastSeen: number | null = null;
    setTimeout(() => this.store.load(+this.id()));
    queueMicrotask(() => {
      const sync = () => {
        const person = this.employee();
        if (person && person.employeeVersion !== lastSeen) {
          lastSeen = person.employeeVersion;
          this.form = {
            fullName: person.fullName, email: person.email, department: person.department,
            role: person.role, level: person.level, employmentType: person.employmentType,
          };
        }
        requestAnimationFrame(sync);
      };
    });
  }

  onSave(): void {
    const person = this.employee();
    if (!person) {
      return;
    }
    this.store.save(+this.id(), { ...this.form, employeeVersion: person.employeeVersion });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: FAIL for the component tests — the constructor above is wrong on purpose; see Step 5.

- [ ] **Step 5: Replace the constructor's polling with an effect**

The `setTimeout`/`requestAnimationFrame` loop in the constructor is not how signals work: it polls, leaks a frame callback forever, and never runs under `provideNoopAnimations` in tests. Replace the whole constructor with:
```ts
  constructor() {
    // Load whenever the route id changes.
    effect(() => this.store.load(+this.id()));

    // Refill the form whenever the record is replaced - including after a save,
    // which returns an incremented version.
    effect(() => {
      const person = this.employee();
      if (person) {
        this.form = {
          fullName: person.fullName, email: person.email, department: person.department,
          role: person.role, level: person.level, employmentType: person.employmentType,
        };
      }
    });
  }
```
and add `effect` to the `@angular/core` import.

Run: `npm test --prefix web`
Expected: PASS — 8 store tests and 3 component tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/employees/employee-detail.store.ts \
        web/src/app/employees/employee-detail.component.ts \
        web/src/app/employees/employee-detail.store.spec.ts \
        web/src/app/employees/employee-detail.component.spec.ts
git commit -m "feat: add employee detail with editing and conflict handling

A 409 shows a reload prompt and is never retried: re-sending with the
fresh version would overwrite whatever the other writer just saved, which
is precisely the lost update the version exists to prevent.

The compa-ratio sits beside the band it was measured against, so the
number is explained where it is read rather than in a legend elsewhere.
An employee with no band says so in words instead of showing a blank."
```

---

### Task 7: Salary history and recording a raise

The timeline is fetched only when its tab opens, keeping the common path small. The raise form carries `salaryVersion` — a different token from the one the edit form uses.

**Files:**
- Create: `web/src/app/employees/salary-history.component.ts`
- Create: `web/src/app/employees/record-raise-dialog.component.ts`
- Test: `web/src/app/employees/salary-history.component.spec.ts`, `record-raise-dialog.component.spec.ts`

**Interfaces:**
- Produces:
  - `SalaryHistoryComponent` — input `employeeId: number`; fetches on first render.
  - `RecordRaiseDialogComponent` — dialog data `{ employeeId, currency, salaryVersion, currentEffectiveFrom }`; closes with `true` on success.

- [ ] **Step 1: Write the failing test**

`web/src/app/employees/salary-history.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { SalaryHistoryComponent } from './salary-history.component';

describe('SalaryHistoryComponent', () => {
  let mock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalaryHistoryComponent],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  function render(employeeId = 7) {
    const fixture = TestBed.createComponent(SalaryHistoryComponent);
    fixture.componentRef.setInput('employeeId', employeeId);
    fixture.detectChanges();
    return fixture;
  }

  it('lists each superseded salary with the period it applied to', () => {
    const fixture = render();
    mock.expectOne('/api/employees/7/salary-history').flush([
      {
        salary: { amount: '3712500.00', currency: 'INR' },
        salaryBaseUsd: { amount: '44550.00', currency: 'USD' },
        effectiveFrom: '2024-03-01', effectiveTo: '2026-01-01', changeReason: 'Annual review',
      },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('₹3,712,500.00');
    expect(text).toContain('2024-03-01');
    expect(text).toContain('2026-01-01');
    expect(text).toContain('Annual review');
  });

  it('says this is the first salary rather than showing an empty list', () => {
    const fixture = render();
    mock.expectOne('/api/employees/7/salary-history').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No previous salaries');
  });

  it('shows the historical amount in both currencies, at the rate that applied then', () => {
    const fixture = render();
    mock.expectOne('/api/employees/7/salary-history').flush([
      {
        salary: { amount: '3000000.00', currency: 'INR' },
        salaryBaseUsd: { amount: '36000.00', currency: 'USD' },
        effectiveFrom: '2023-03-01', effectiveTo: '2024-03-01',
      },
    ]);
    fixture.detectChanges();

    // The rate is frozen on the row, so this figure never moves.
    expect(fixture.nativeElement.textContent).toContain('$36,000.00');
  });
});
```

`web/src/app/employees/record-raise-dialog.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { RecordRaiseDialogComponent } from './record-raise-dialog.component';

describe('RecordRaiseDialogComponent', () => {
  let mock: HttpTestingController;
  const dialogRef = { close: jest.fn() };

  beforeEach(async () => {
    dialogRef.close.mockReset();
    await TestBed.configureTestingModule({
      imports: [RecordRaiseDialogComponent],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { employeeId: 7, currency: 'INR', salaryVersion: 2,
                      currentEffectiveFrom: '2024-03-01' },
        },
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('sends the salary version, not the employee version', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: 'Promotion' };

    fixture.componentInstance.submit();

    const request = mock.expectOne('/api/employees/7/salary');
    expect(request.request.body).toEqual({
      salary: { amount: '4640625.00', currency: 'INR' },
      effectiveFrom: '2026-01-01',
      changeReason: 'Promotion',
      salaryVersion: 2,
    });
    request.flush({});
  });

  it('locks the currency to the one the employee is paid in', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    // The server rejects a mismatch, so offering a choice would only invite a
    // 400 the user cannot act on.
    expect(fixture.nativeElement.textContent).toContain('INR');
    expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
  });

  it('closes and reports success once the raise is recorded', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush({});

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('keeps the dialog open and shows why when the server rejects the date', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2024-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush(
      { title: 'Rule violation',
        detail: 'A new salary must take effect after the current one, which began 2024-03-01' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('must take effect after');
  });

  it('reports a replayed submission as a conflict rather than applying it twice', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('already been recorded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — neither component exists.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/employees/salary-history.component.ts`
```ts
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MoneyPipe } from '../core/money.pipe';
import { ApiError } from '../core/problem-detail';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { StatePanelComponent } from '../shared/state-panel.component';
import { EmployeeApiService } from './employee-api.service';
import { SalaryHistoryItem } from './employee.models';

/**
 * Rendered inside an ngTemplateOutlet on the timeline tab, so this component -
 * and its request - only exist once the tab is opened.
 */
@Component({
  selector: 'app-salary-history',
  standalone: true,
  imports: [MatTableModule, MoneyPipe, StatePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-state-panel
      [state]="state()"
      [isEmpty]="rows().length === 0"
      emptyMessage="No previous salaries. This is the first one on record."
      (retry)="load()" />

    @if (rows().length > 0) {
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="period">
          <th mat-header-cell *matHeaderCellDef>Period</th>
          <td mat-cell *matCellDef="let row">{{ row.effectiveFrom }} to {{ row.effectiveTo }}</td>
        </ng-container>
        <ng-container matColumnDef="salary">
          <th mat-header-cell *matHeaderCellDef>Salary</th>
          <td mat-cell *matCellDef="let row">
            {{ row.salary | money }}<span class="muted">{{ row.salaryBaseUsd | money }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="reason">
          <th mat-header-cell *matHeaderCellDef>Reason</th>
          <td mat-cell *matCellDef="let row">{{ row.changeReason || '—' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    }
  `,
  styles: [`
    table { width: 100%; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
  `],
})
export class SalaryHistoryComponent {
  readonly employeeId = input.required<number>();

  private readonly api = inject(EmployeeApiService);
  protected readonly state = signal<RequestState<SalaryHistoryItem[]>>(loading());
  protected readonly columns = ['period', 'salary', 'reason'];

  constructor() {
    effect(() => {
      this.employeeId();
      this.load();
    });
  }

  protected load(): void {
    this.state.set(loading());
    this.api.salaryHistory(this.employeeId()).subscribe({
      next: rows => this.state.set(ready(rows)),
      error: (error: ApiError) => this.state.set(failed(error)),
    });
  }

  protected rows(): SalaryHistoryItem[] {
    const state = this.state();
    return state.status === 'ready' ? state.data : [];
  }
}
```

`web/src/app/employees/record-raise-dialog.component.ts`
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { ApiError } from '../core/problem-detail';
import { EmployeeApiService } from './employee-api.service';

export interface RecordRaiseData {
  readonly employeeId: number;
  readonly currency: string;
  readonly salaryVersion: number;
  readonly currentEffectiveFrom: string;
}

@Component({
  selector: 'app-record-raise-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Record a new salary</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline">
        <mat-label>Amount in {{ data.currency }}</mat-label>
        <input matInput inputmode="decimal" [(ngModel)]="form.amount" />
        <span matTextSuffix>{{ data.currency }}</span>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Effective from</mat-label>
        <input matInput type="date" [(ngModel)]="form.effectiveFrom" />
        <mat-hint>Must be after {{ data.currentEffectiveFrom }}</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Reason</mat-label>
        <input matInput [(ngModel)]="form.changeReason" />
      </mat-form-field>

      @if (message(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="saving()" (click)="submit()">Record</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { display: flex; flex-direction: column; gap: .5rem; min-width: 22rem; }
    .error { color: var(--mat-sys-error, #b3261e); margin: 0; }
  `],
})
export class RecordRaiseDialogComponent {
  protected readonly data = inject<RecordRaiseData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RecordRaiseDialogComponent>);
  private readonly api = inject(EmployeeApiService);

  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);

  form = { amount: '', effectiveFrom: '', changeReason: '' };

  submit(): void {
    this.saving.set(true);
    this.message.set(null);

    this.api
      .recordRaise(this.data.employeeId, {
        // Currency is fixed to the employee's own: the server rejects a
        // mismatch, so offering a choice would only invite a 400.
        salary: { amount: this.form.amount, currency: this.data.currency },
        effectiveFrom: this.form.effectiveFrom,
        changeReason: this.form.changeReason || undefined,
        salaryVersion: this.data.salaryVersion,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogRef.close(true);
        },
        error: (error: ApiError) => {
          this.saving.set(false);
          // A conflict here means the version was already consumed - almost
          // always a double submission. Say so plainly; never resend.
          this.message.set(
            error.isConflict
              ? 'This raise has already been recorded, or someone else changed the salary. Close and reload.'
              : error.detail,
          );
        },
      });
  }
}
```

Wire the dialog into `EmployeeDetailComponent`: add a "Record a raise" button on the pay card that opens `RecordRaiseDialogComponent` with `{ employeeId, currency: person.salary.currency, salaryVersion: person.salaryVersion, currentEffectiveFrom: person.salaryEffectiveFrom }`, and calls `store.load(+this.id())` when it closes with `true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/employees
git commit -m "feat: add salary history timeline and the raise dialog

History is fetched only when its tab opens, so the common path stays
small. Each historical row shows both currencies at the rate frozen on
it, so a past figure never moves.

The raise form carries salaryVersion, a different token from the one the
edit form sends, and a 409 is reported as an already-recorded raise
rather than resubmitted."
```

---

### Task 8: Analytics API and the insights store

State for the insights screen: shared filters, the group-by selection capped at two, and three independent requests.

**Files:**
- Create: `web/src/app/insights/analytics.models.ts`, `analytics-api.service.ts`, `insights.store.ts`
- Test: `web/src/app/insights/insights.store.spec.ts`

**Interfaces:**
- Produces:
  - `SummaryResponse`, `DistributionGroup`, `OutlierItem`, `CompaRatioBucket`, `AnalyticsFilterValues`
  - `AnalyticsApiService.summary(filters)`, `.distribution(filters, groupBy)`, `.outliers(filters, page, size)`
  - `InsightsStore` — signals `country`, `department`, `level`, `status`, `groupBy`, `outlierPage`; computed `summary`, `distribution`, `outliers`; methods `setFilter`, `setGroupBy`, `setOutlierPage`

- [ ] **Step 1: Write the failing test**

`web/src/app/insights/insights.store.spec.ts`
```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { InsightsStore } from './insights.store';

const SUMMARY = {
  headcount: 12,
  totalCostToCompanyUsd: { amount: '1405077.50', currency: 'USD' },
  meanBaseUsd: { amount: '117089.79', currency: 'USD' },
  unbandedCount: 1,
  compaRatioBuckets: [
    { bucket: 'LT_80', headcount: 1 }, { bucket: 'B80_90', headcount: 2 },
    { bucket: 'B90_110', headcount: 5 }, { bucket: 'B110_120', headcount: 2 },
    { bucket: 'GT_120', headcount: 2 },
  ],
};

describe('InsightsStore', () => {
  let store: InsightsStore;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InsightsStore,
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(InsightsStore);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  function flushAll() {
    mock.match(r => r.url === '/api/analytics/summary').forEach(r => r.flush(SUMMARY));
    mock.match(r => r.url === '/api/analytics/distribution').forEach(r => r.flush([]));
    mock.match(r => r.url === '/api/analytics/outliers').forEach(r =>
      r.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }));
  }

  it('asks for all three views on creation', fakeAsync(() => {
    tick();
    expect(mock.match(r => r.url === '/api/analytics/summary').length).toBe(1);
    expect(mock.match(r => r.url === '/api/analytics/distribution').length).toBe(1);
    expect(mock.match(r => r.url === '/api/analytics/outliers').length).toBe(1);
    // match() consumed them; flush a fresh set is unnecessary here.
  }));

  it('groups by country out of the box, because that is the question most often asked', fakeAsync(() => {
    tick();
    const request = mock.expectOne(r => r.url === '/api/analytics/distribution');
    expect(request.request.params.getAll('groupBy')).toEqual(['COUNTRY']);
    request.flush([]);
    mock.match(() => true).forEach(r => r.flush(SUMMARY));
  }));

  it('sends both dimensions when two are selected', fakeAsync(() => {
    tick();
    flushAll();

    store.setGroupBy(['COUNTRY', 'LEVEL']);
    tick();

    const request = mock.expectOne(r => r.url === '/api/analytics/distribution');
    expect(request.request.params.getAll('groupBy')).toEqual(['COUNTRY', 'LEVEL']);
    request.flush([]);
  }));

  it('refuses a third dimension locally rather than letting the server reject it', fakeAsync(() => {
    tick();
    flushAll();

    expect(() => store.setGroupBy(['COUNTRY', 'LEVEL', 'ROLE'] as never)).toThrow(/two/);
  }));

  it('applies one filter change to all three views at once', fakeAsync(() => {
    tick();
    flushAll();

    store.setFilter('country', 'IN');
    tick();

    expect(mock.expectOne(r => r.url === '/api/analytics/summary')
      .request.params.get('country')).toBe('IN');
    expect(mock.expectOne(r => r.url === '/api/analytics/distribution')
      .request.params.get('country')).toBe('IN');
    expect(mock.expectOne(r => r.url === '/api/analytics/outliers')
      .request.params.get('country')).toBe('IN');
    flushAll();
  }));

  it('returns the outlier list to its first page when a filter changes', fakeAsync(() => {
    tick();
    flushAll();

    store.setOutlierPage(3);
    tick();
    mock.expectOne(r => r.request.params.get('page') === '3').flush(
      { content: [], page: 3, size: 25, totalElements: 0, totalPages: 0 });

    store.setFilter('level', 'SENIOR');
    tick();
    const request = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(request.request.params.get('page')).toBe('0');
    flushAll();
  }));

  it('exposes an error state per view, so one failure does not blank the screen', fakeAsync(() => {
    tick();
    mock.expectOne(r => r.url === '/api/analytics/summary').flush(SUMMARY);
    mock.expectOne(r => r.url === '/api/analytics/distribution')
      .flush({ title: 'Something went wrong', detail: 'The request could not be completed.' },
             { status: 500, statusText: 'Server Error' });
    mock.expectOne(r => r.url === '/api/analytics/outliers')
      .flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });

    expect(store.summary().status).toBe('ready');
    expect(store.distribution().status).toBe('error');
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — `InsightsStore` does not exist.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/insights/analytics.models.ts`
```ts
import { Money } from '../core/money';

export type GroupByDimension = 'DEPARTMENT' | 'COUNTRY' | 'ROLE' | 'LEVEL';
export type CompaRatioBucketKey = 'LT_80' | 'B80_90' | 'B90_110' | 'B110_120' | 'GT_120';

export interface CompaRatioBucket {
  readonly bucket: CompaRatioBucketKey;
  readonly headcount: number;
}

export interface SummaryResponse {
  readonly headcount: number;
  readonly totalCostToCompanyUsd: Money;
  readonly meanBaseUsd: Money;
  /** Employees whose role, level and country combination has no band. Never hidden. */
  readonly unbandedCount: number;
  readonly compaRatioBuckets: ReadonlyArray<CompaRatioBucket>;
}

export interface DistributionGroup {
  readonly key: Readonly<Record<string, string>>;
  readonly headcount: number;
  readonly p25?: Money;
  readonly p50?: Money;
  readonly p75?: Money;
  readonly p90?: Money;
  readonly mean?: Money;
  readonly medianCompaRatio?: string;
}

export interface OutlierItem {
  readonly employeeId: number;
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly countryCode: string;
  readonly role: string;
  readonly level: string;
  readonly salary: Money;
  readonly bandMid: Money;
  readonly compaRatio: string;
}

export interface OutlierPage {
  readonly content: ReadonlyArray<OutlierItem>;
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface AnalyticsFilterValues {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
}
```

`web/src/app/insights/analytics-api.service.ts`
```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AnalyticsFilterValues, DistributionGroup, GroupByDimension, OutlierPage, SummaryResponse,
} from './analytics.models';

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient);

  summary(filters: AnalyticsFilterValues): Observable<SummaryResponse> {
    return this.http.get<SummaryResponse>('/api/analytics/summary', { params: toParams(filters) });
  }

  distribution(
    filters: AnalyticsFilterValues,
    groupBy: readonly GroupByDimension[],
  ): Observable<DistributionGroup[]> {
    let params = toParams(filters);
    for (const dimension of groupBy) {
      params = params.append('groupBy', dimension);
    }
    return this.http.get<DistributionGroup[]>('/api/analytics/distribution', { params });
  }

  outliers(filters: AnalyticsFilterValues, page: number, size: number): Observable<OutlierPage> {
    const params = toParams(filters).set('page', page).set('size', size);
    return this.http.get<OutlierPage>('/api/analytics/outliers', { params });
  }
}

function toParams(filters: AnalyticsFilterValues): HttpParams {
  let params = new HttpParams();
  if (filters.country) params = params.set('country', filters.country);
  if (filters.department) params = params.set('department', filters.department);
  if (filters.level) params = params.set('level', filters.level);
  if (filters.status) params = params.set('status', filters.status);
  return params;
}
```

`web/src/app/insights/insights.store.ts`
```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../core/problem-detail';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { AnalyticsApiService } from './analytics-api.service';
import {
  AnalyticsFilterValues, DistributionGroup, GroupByDimension, OutlierPage, SummaryResponse,
} from './analytics.models';

export const MAX_GROUP_BY = 2;

@Injectable()
export class InsightsStore {
  private readonly api = inject(AnalyticsApiService);

  readonly country = signal<string | null>(null);
  readonly department = signal<string | null>(null);
  readonly level = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  /** Country first: "what do we pay a senior engineer here versus there" is the question most asked. */
  readonly groupBy = signal<readonly GroupByDimension[]>(['COUNTRY']);
  readonly outlierPage = signal(0);
  readonly outlierSize = signal(25);

  readonly filters = computed<AnalyticsFilterValues>(() => ({
    country: this.country(),
    department: this.department(),
    level: this.level(),
    status: this.status(),
  }));

  readonly summary = toSignal<RequestState<SummaryResponse>>(
    toObservable(this.filters).pipe(switchMap(filters => track(this.api.summary(filters)))),
    { initialValue: loading<SummaryResponse>() },
  );

  readonly distribution = toSignal<RequestState<DistributionGroup[]>>(
    toObservable(computed(() => ({ filters: this.filters(), groupBy: this.groupBy() }))).pipe(
      switchMap(({ filters, groupBy }) => track(this.api.distribution(filters, groupBy))),
    ),
    { initialValue: loading<DistributionGroup[]>() },
  );

  readonly outliers = toSignal<RequestState<OutlierPage>>(
    toObservable(
      computed(() => ({ filters: this.filters(), page: this.outlierPage(), size: this.outlierSize() })),
    ).pipe(switchMap(({ filters, page, size }) => track(this.api.outliers(filters, page, size)))),
    { initialValue: loading<OutlierPage>() },
  );

  setFilter(key: keyof AnalyticsFilterValues, value: string | null): void {
    this[key].set(value);
    // A narrower filter means a shorter outlier list; page 4 of it may not exist.
    this.outlierPage.set(0);
  }

  setGroupBy(dimensions: readonly GroupByDimension[]): void {
    if (dimensions.length > MAX_GROUP_BY) {
      // Caught here rather than as a 400: the control should not have allowed it.
      throw new Error(`Group by at most two dimensions, was given ${dimensions.length}`);
    }
    this.groupBy.set(dimensions);
  }

  setOutlierPage(page: number): void {
    this.outlierPage.set(page);
  }
}

/** Wraps a request as loading, then ready or error, without throwing into the signal. */
function track<T>(source: import('rxjs').Observable<T>) {
  return source.pipe(
    map(data => ready(data)),
    catchError((error: ApiError) => of(failed<T>(error))),
    startWith(loading<T>()),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/insights
git commit -m "feat: add analytics API and insights store

One set of filters drives all three views, each tracking its own state so
a failure in one does not blank the screen.

The two-dimension group-by cap is enforced in the store as well as the
server: a control that allows a third dimension is a bug on this side,
and a 400 would be a poor way to discover it."
```

---

### Task 9: The insights dashboard and its two charts

Implements spec §10's insights screen and ADR-0006. **This task also settles zoneless** — see Step 5.

**No box plot.** The persona is explicitly non-technical, and a chart that requires knowing what a whisker means is worse than a table. Two charts instead, both fed precomputed scalars:

1. **Median pay by group**, a horizontal bar — the "India versus the UK" question answered at a glance, with exact percentiles in the table beneath.
2. **Headcount by compa-ratio band**, a vertical bar — a histogram, legible without training, whose edge bars *are* the answer to "is anyone badly out of band?"

**One bounded exception to the money rule.** A bar's length has to be a number; SVG geometry cannot be driven by a string. So the chart's `value` is `Number(amount)` — used for pixels only. **Every label the user reads comes from the original string**, formatted by `formatMoney`, never from the converted number. A test asserts that, so a regression that starts displaying the number instead fails the build.

**Files:**
- Create: `web/src/app/insights/summary-tiles.component.ts`, `median-pay-chart.component.ts`, `compa-ratio-histogram.component.ts`
- Replace: `web/src/app/insights/insights.component.ts` (the Task 1 placeholder)
- Test: specs for each of the three new components
- Create, only if Step 5 succeeds: `docs/adr/0008-zoneless-angular.md`

**Interfaces:**
- Produces:
  - `SummaryTilesComponent` — input `summary: SummaryResponse`
  - `MedianPayChartComponent` — input `groups: DistributionGroup[]`
  - `CompaRatioHistogramComponent` — input `buckets: CompaRatioBucket[]`; output `bucketSelected: CompaRatioBucketKey`
  - `InsightsComponent` at route `/insights`

- [ ] **Step 1: Write the failing test**

`web/src/app/insights/median-pay-chart.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MedianPayChartComponent } from './median-pay-chart.component';
import { DistributionGroup } from './analytics.models';

const GROUPS: DistributionGroup[] = [
  {
    key: { country: 'IN' }, headcount: 3,
    p25: { amount: '40095.00', currency: 'USD' }, p50: { amount: '44550.00', currency: 'USD' },
    p75: { amount: '50118.75', currency: 'USD' }, p90: { amount: '53460.00', currency: 'USD' },
    mean: { amount: '45292.50', currency: 'USD' }, medianCompaRatio: '1.0000',
  },
  {
    key: { country: 'US' }, headcount: 5,
    p25: { amount: '148500.00', currency: 'USD' }, p50: { amount: '148500.00', currency: 'USD' },
    p75: { amount: '193050.00', currency: 'USD' }, p90: { amount: '197220.00', currency: 'USD' },
    mean: { amount: '158800.00', currency: 'USD' }, medianCompaRatio: '1.0000',
  },
];

describe('MedianPayChartComponent', () => {
  async function render(groups: DistributionGroup[]) {
    await TestBed.configureTestingModule({
      imports: [MedianPayChartComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    const fixture = TestBed.createComponent(MedianPayChartComponent);
    fixture.componentRef.setInput('groups', groups);
    fixture.detectChanges();
    return fixture;
  }

  it('feeds the chart one precomputed median per group', async () => {
    const fixture = await render(GROUPS);
    // No statistics in the browser: these are the server's p50 values, not
    // anything this component calculated - ADR-0006.
    expect(fixture.componentInstance.series()).toEqual([
      { name: 'IN', value: 44550 },
      { name: 'US', value: 148500 },
    ]);
  });

  it('labels each group with the exact string the server sent, not the chart number', async () => {
    const fixture = await render(GROUPS);
    // The number drives pixels only. Every figure the user reads is formatted
    // from the original string.
    expect(fixture.componentInstance.formatValue(44550)).toBe('$44,550.00');
  });

  it('joins two grouping dimensions into one readable label', async () => {
    const fixture = await render([
      { ...GROUPS[0], key: { country: 'IN', level: 'SENIOR' } },
    ]);
    expect(fixture.componentInstance.series()[0].name).toBe('IN · Senior');
  });

  it('labels the single whole-organization group rather than showing a blank axis', async () => {
    const fixture = await render([{ ...GROUPS[0], key: {} }]);
    expect(fixture.componentInstance.series()[0].name).toBe('Whole organization');
  });

  it('skips a group with no median rather than plotting it as zero', async () => {
    const fixture = await render([{ key: { country: 'BR' }, headcount: 0 }]);
    expect(fixture.componentInstance.series()).toEqual([]);
  });

  it('renders an svg, proving the chart library works without zone.js', async () => {
    const fixture = await render(GROUPS);
    expect(fixture.nativeElement.querySelector('svg')).toBeTruthy();
  });
});
```

`web/src/app/insights/compa-ratio-histogram.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CompaRatioHistogramComponent } from './compa-ratio-histogram.component';

const BUCKETS = [
  { bucket: 'LT_80' as const, headcount: 1 },
  { bucket: 'B80_90' as const, headcount: 2 },
  { bucket: 'B90_110' as const, headcount: 5 },
  { bucket: 'B110_120' as const, headcount: 2 },
  { bucket: 'GT_120' as const, headcount: 2 },
];

describe('CompaRatioHistogramComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [CompaRatioHistogramComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompaRatioHistogramComponent);
    fixture.componentRef.setInput('buckets', BUCKETS);
    fixture.detectChanges();
    return fixture;
  }

  it('labels each band in percentages a non-technical reader can act on', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.series().map(p => p.name)).toEqual([
      'Under 80%', '80-90%', '90-110%', '110-120%', 'Over 120%',
    ]);
  });

  it('keeps the bands in order so the shape of the distribution is visible', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.series().map(p => p.value)).toEqual([1, 2, 5, 2, 2]);
  });

  it('colours only the two out-of-band bars as problems', async () => {
    const fixture = await render();
    const scheme = fixture.componentInstance.colourScheme.domain;
    expect(scheme[0]).toBe(fixture.componentInstance.outOfBandColour);
    expect(scheme[4]).toBe(fixture.componentInstance.outOfBandColour);
    expect(scheme[2]).not.toBe(fixture.componentInstance.outOfBandColour);
  });

  it('emits the band when a bar is clicked, so the outlier table can be filtered', async () => {
    const fixture = await render();
    const emitted: string[] = [];
    fixture.componentInstance.bucketSelected.subscribe((b: string) => emitted.push(b));

    fixture.componentInstance.onSelect({ name: 'Under 80%', value: 1 });

    expect(emitted).toEqual(['LT_80']);
  });
});
```

`web/src/app/insights/summary-tiles.component.spec.ts`
```ts
import { TestBed } from '@angular/core/testing';
import { SummaryTilesComponent } from './summary-tiles.component';

const SUMMARY = {
  headcount: 12,
  totalCostToCompanyUsd: { amount: '1405077.50', currency: 'USD' },
  meanBaseUsd: { amount: '117089.79', currency: 'USD' },
  unbandedCount: 1,
  compaRatioBuckets: [],
};

describe('SummaryTilesComponent', () => {
  async function render(summary = SUMMARY) {
    await TestBed.configureTestingModule({ imports: [SummaryTilesComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SummaryTilesComponent);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return fixture;
  }

  it('states the payroll total in one currency and says which', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('$1,405,077.50');
    expect(text).toContain('USD');
  });

  it('reports employees with no pay band rather than hiding them', async () => {
    const fixture = await render();
    // Dropping them silently would make the outlier list quietly incomplete.
    expect(fixture.nativeElement.textContent).toContain('1');
    expect(fixture.nativeElement.textContent).toContain('no pay band');
  });

  it('omits the unbanded tile when every employee has a band', async () => {
    const fixture = await render({ ...SUMMARY, unbandedCount: 0 });
    expect(fixture.nativeElement.textContent).not.toContain('no pay band');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — none of the three components exists.

- [ ] **Step 3: Write minimal implementation**

`web/src/app/insights/summary-tiles.component.ts`
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MoneyPipe } from '../core/money.pipe';
import { SummaryResponse } from './analytics.models';

@Component({
  selector: 'app-summary-tiles',
  standalone: true,
  imports: [MatCardModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tiles">
      <mat-card>
        <span class="label">Headcount</span>
        <span class="figure">{{ summary().headcount }}</span>
      </mat-card>
      <mat-card>
        <span class="label">Total cost to company</span>
        <span class="figure">{{ summary().totalCostToCompanyUsd | money }}</span>
        <span class="note">USD, converted at the rate recorded on each salary</span>
      </mat-card>
      <mat-card>
        <span class="label">Mean salary</span>
        <span class="figure">{{ summary().meanBaseUsd | money }}</span>
        <span class="note">USD</span>
      </mat-card>
      @if (summary().unbandedCount > 0) {
        <mat-card>
          <span class="label">Without a pay band</span>
          <span class="figure">{{ summary().unbandedCount }}</span>
          <span class="note">
            These employees have no pay band for their role, level and country. They count towards
            headcount and payroll, but have no compa-ratio.
          </span>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
    mat-card { padding: 1.25rem; display: flex; flex-direction: column; gap: .25rem; }
    .label { font-size: .85rem; opacity: .7; }
    .figure { font-size: 1.9rem; font-variant-numeric: tabular-nums; }
    .note { font-size: .75rem; opacity: .6; }
  `],
})
export class SummaryTilesComponent {
  readonly summary = input.required<SummaryResponse>();
}
```

`web/src/app/insights/median-pay-chart.component.ts`
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarChartModule } from '@swimlane/ngx-charts';
import { formatMoney } from '../core/money';
import { titleCase } from '../shared/reference';
import { DistributionGroup } from './analytics.models';

export interface ChartPoint {
  readonly name: string;
  readonly value: number;
}

/**
 * Consumes the server's p50 directly. No statistics happen here - ADR-0006.
 *
 * A bar's length must be a number, so value is Number(amount). That number
 * drives pixels only: every figure the reader sees is formatted from the
 * original string by formatValue.
 */
@Component({
  selector: 'app-median-pay-chart',
  standalone: true,
  imports: [BarChartModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Median pay by group</h2>
    <p class="note">In USD, so groups in different currencies are comparable.</p>
    <ngx-charts-bar-horizontal
      [results]="series()"
      [xAxis]="true"
      [yAxis]="true"
      [xAxisTickFormatting]="formatValue"
      [roundDomains]="true"
      [view]="[720, 360]" />
  `,
  styles: [`:host { display: block; } .note { opacity: .7; font-size: .85rem; }`],
})
export class MedianPayChartComponent {
  readonly groups = input.required<ReadonlyArray<DistributionGroup>>();

  readonly series = computed<ChartPoint[]>(() =>
    this.groups()
      .filter(group => !!group.p50)
      .map(group => ({ name: label(group), value: Number(group.p50!.amount) })),
  );

  /** Bound as a method reference, so it must not depend on `this`. */
  readonly formatValue = (value: number): string =>
    formatMoney({ amount: String(value), currency: 'USD' });
}

function label(group: DistributionGroup): string {
  const parts = Object.entries(group.key).map(([dimension, value]) =>
    dimension === 'country' ? value : titleCase(value),
  );
  return parts.length > 0 ? parts.join(' · ') : 'Whole organization';
}
```

`web/src/app/insights/compa-ratio-histogram.component.ts`
```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BarChartModule } from '@swimlane/ngx-charts';
import { CompaRatioBucket, CompaRatioBucketKey } from './analytics.models';
import { ChartPoint } from './median-pay-chart.component';

const BANDS: ReadonlyArray<{ key: CompaRatioBucketKey; label: string; problem: boolean }> = [
  { key: 'LT_80', label: 'Under 80%', problem: true },
  { key: 'B80_90', label: '80-90%', problem: false },
  { key: 'B90_110', label: '90-110%', problem: false },
  { key: 'B110_120', label: '110-120%', problem: false },
  { key: 'GT_120', label: 'Over 120%', problem: true },
];

/**
 * A histogram, not a box plot: it reads as "how many people are where" with no
 * training, and the two edge bars are themselves the answer to "is anyone badly
 * out of band?" Counts come from a SQL aggregate.
 */
@Component({
  selector: 'app-compa-ratio-histogram',
  standalone: true,
  imports: [BarChartModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>How many people sit where against their band</h2>
    <p class="note">Click a bar to see those employees.</p>
    <ngx-charts-bar-vertical
      [results]="series()"
      [xAxis]="true"
      [yAxis]="true"
      [scheme]="colourScheme"
      [roundDomains]="true"
      [view]="[720, 360]"
      (select)="onSelect($event)" />
  `,
  styles: [`:host { display: block; } .note { opacity: .7; font-size: .85rem; }`],
})
export class CompaRatioHistogramComponent {
  readonly buckets = input.required<ReadonlyArray<CompaRatioBucket>>();
  readonly bucketSelected = output<CompaRatioBucketKey>();

  readonly outOfBandColour = '#b3261e';
  readonly inBandColour = '#3f51b5';

  readonly colourScheme = {
    name: 'compa-ratio',
    selectable: false,
    group: 'Ordinal',
    domain: BANDS.map(band => (band.problem ? this.outOfBandColour : this.inBandColour)),
  };

  readonly series = computed<ChartPoint[]>(() => {
    const counts = new Map(this.buckets().map(b => [b.bucket, b.headcount]));
    // Driven by BANDS, not by the response order, so the bars are always in
    // ascending order and a missing bucket shows as zero rather than vanishing.
    return BANDS.map(band => ({ name: band.label, value: counts.get(band.key) ?? 0 }));
  });

  onSelect(point: { name: string }): void {
    const band = BANDS.find(b => b.label === point.name);
    if (band) {
      this.bucketSelected.emit(band.key);
    }
  }
}
```

`web/src/app/insights/insights.component.ts` — the dashboard shell:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { FilterBarComponent, FilterChange } from '../employees/filter-bar.component';
import { InsightsStore } from './insights.store';
import { SummaryTilesComponent } from './summary-tiles.component';
import { MedianPayChartComponent } from './median-pay-chart.component';
import { CompaRatioHistogramComponent } from './compa-ratio-histogram.component';
import { OutlierTableComponent } from './outlier-table.component';
import { CompaRatioBucketKey, GroupByDimension } from './analytics.models';
import { titleCase } from '../shared/reference';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    MatFormFieldModule, MatSelectModule, MatTableModule, MoneyPipe, StatePanelComponent,
    FilterBarComponent, SummaryTilesComponent, MedianPayChartComponent,
    CompaRatioHistogramComponent, OutlierTableComponent,
  ],
  providers: [InsightsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Pay insights</h1>

    <app-filter-bar [value]="store.filters()" (changed)="onFilterChange($event)" />

    <app-state-panel [state]="store.summary()" />
    @if (summaryData(); as summary) {
      <app-summary-tiles [summary]="summary" />
      <app-compa-ratio-histogram
        [buckets]="summary.compaRatioBuckets"
        (bucketSelected)="onBucketSelected($event)" />
    }

    <mat-form-field appearance="outline" class="group-by">
      <mat-label>Group by (up to two)</mat-label>
      <mat-select multiple [value]="store.groupBy()" (valueChange)="onGroupBy($event)">
        @for (dimension of dimensions; track dimension) {
          <mat-option [value]="dimension"
                      [disabled]="isDimensionDisabled(dimension)">{{ label(dimension) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <app-state-panel
      [state]="store.distribution()"
      [isEmpty]="groups().length === 0"
      emptyMessage="No employees match these filters, so there is nothing to compare." />

    @if (groups().length > 0) {
      <app-median-pay-chart [groups]="groups()" />

      <table mat-table [dataSource]="groups()">
        <ng-container matColumnDef="group">
          <th mat-header-cell *matHeaderCellDef>Group</th>
          <td mat-cell *matCellDef="let row">{{ groupLabel(row) }}</td>
        </ng-container>
        <ng-container matColumnDef="headcount">
          <th mat-header-cell *matHeaderCellDef>People</th>
          <td mat-cell *matCellDef="let row">{{ row.headcount }}</td>
        </ng-container>
        @for (percentile of percentiles; track percentile) {
          <ng-container [matColumnDef]="percentile">
            <th mat-header-cell *matHeaderCellDef>{{ percentile }}</th>
            <td mat-cell *matCellDef="let row">{{ row[percentile] | money }}</td>
          </ng-container>
        }
        <ng-container matColumnDef="medianCompaRatio">
          <th mat-header-cell *matHeaderCellDef>Median compa-ratio</th>
          <td mat-cell *matCellDef="let row">{{ row.medianCompaRatio ?? '—' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
      <p class="note">
        Percentiles are in USD and answer what a group costs. Median compa-ratio compares each
        salary against its own country's band, so it is the figure to use when comparing countries.
      </p>
    }

    <app-outlier-table [selectedBucket]="selectedBucket()" />
  `,
  styles: [`
    .group-by { min-width: 20rem; margin-top: 1.5rem; }
    table { width: 100%; margin-top: 1rem; }
    .note { opacity: .7; font-size: .85rem; max-width: 60rem; }
  `],
})
export class InsightsComponent {
  protected readonly store = inject(InsightsStore);
  protected readonly dimensions: GroupByDimension[] = ['COUNTRY', 'DEPARTMENT', 'ROLE', 'LEVEL'];
  protected readonly percentiles = ['p25', 'p50', 'p75', 'p90', 'mean'];
  protected readonly columns =
    ['group', 'headcount', 'p25', 'p50', 'p75', 'p90', 'mean', 'medianCompaRatio'];
  protected readonly label = titleCase;
  protected readonly selectedBucket = signal<CompaRatioBucketKey | null>(null);

  protected summaryData() {
    const state = this.store.summary();
    return state.status === 'ready' ? state.data : null;
  }

  protected groups() {
    const state = this.store.distribution();
    return state.status === 'ready' ? state.data : [];
  }

  protected groupLabel(group: { key: Record<string, string> }): string {
    const parts = Object.values(group.key);
    return parts.length > 0 ? parts.join(' · ') : 'Whole organization';
  }

  /** Disables the unselected options once two are chosen, so the cap cannot be exceeded. */
  protected isDimensionDisabled(dimension: GroupByDimension): boolean {
    const selected = this.store.groupBy();
    return selected.length >= 2 && !selected.includes(dimension);
  }

  protected onGroupBy(dimensions: GroupByDimension[]): void {
    this.store.setGroupBy(dimensions);
  }

  protected onFilterChange(change: FilterChange): void {
    this.store.setFilter(change.key, change.value);
  }

  protected onBucketSelected(bucket: CompaRatioBucketKey): void {
    this.selectedBucket.set(bucket);
  }
}
```

`OutlierTableComponent` is built in Task 10; create a placeholder that accepts `selectedBucket` and renders nothing, so this task compiles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS — 13 tests.

- [ ] **Step 5: Settle zoneless, and write ADR-0008 only if it holds**

The chart specs render real ngx-charts components. If `renders an svg, proving the chart library works without zone.js` passes, the library does not depend on zone.js for its initial render.

Then verify it interactively, because a passing unit test is not a rendered dashboard:
```bash
docker compose up -d db
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev &
npm start --prefix web
```
Open `http://localhost:4200/insights` and confirm: both charts draw, bars animate on load, tooltips appear on hover, and the histogram responds to a click.

**If all of that holds**, write `docs/adr/0008-zoneless-angular.md` in Nygard format recording: the context (signal-based stores, RxJS only at the HTTP boundary), the decision (`provideZonelessChangeDetection`), and the consequences — including that ngx-charts was verified by rendering rather than assumed, and that `jest-preset-angular` still loads `zone.js/testing` so `fakeAsync` remains available in tests.

**If any of it fails**, change one line in `app.config.ts` to `provideZoneChangeDetection({ eventCoalescing: true })`, write **no ADR**, and note the finding in the commit message. Nothing else in the application changes — that was the point of keeping state in signals.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/insights docs/adr
git commit -m "feat: add the insights dashboard with two readable charts

No box plot. The persona is non-technical, and a chart that needs the
reader to know what a whisker means is worse than a table. A median bar
chart answers the comparison question, and a compa-ratio histogram
answers whether anyone is badly out of band - its two edge bars are the
answer, and clicking one filters the employees behind it.

Both charts consume precomputed scalars. The one number conversion is a
bar's length, which has to be numeric to become pixels; every figure the
reader sees is still formatted from the original string."
```

---

### Task 10: The outlier table, and the backend change it needs

**Read this before starting.** Task 9's histogram says "click a bar to see those employees", and the two edge bars are the ones that matter. But `/api/analytics/outliers` returns *all* outliers with no way to ask for only the underpaid or only the overpaid. Filtering the returned page in the browser would be wrong — it would filter one page rather than the set, so the paginator would report counts that do not match what is shown.

So this task **amends the backend**: one optional parameter, one predicate, one test. It is called out here rather than worked around because a plan that silently filters a page is a plan that ships a wrong total.

**Files:**
- Modify (backend): `src/main/java/com/payscope/analytics/AnalyticsRepository.java`, `AnalyticsService.java`, `AnalyticsController.java`
- Test (backend): `src/test/java/com/payscope/analytics/OutliersApiTest.java`
- Replace: `web/src/app/insights/outlier-table.component.ts` (the Task 9 placeholder)
- Test: `web/src/app/insights/outlier-table.component.spec.ts`

**Interfaces:**
- Produces:
  - Backend: `GET /api/analytics/outliers?band=LT_80|GT_120` — absent means both.
  - `OutlierTableComponent` — input `selectedBucket: CompaRatioBucketKey | null`.

- [ ] **Step 1: Write the failing backend test**

Add to `src/test/java/com/payscope/analytics/OutliersApiTest.java`:
```java
    @Test
    void returns_only_the_underpaid_when_asked_for_the_low_band() throws Exception {
        // From the fixture, only U1 sits below 0.80.
        mvc.perform(get("/api/analytics/outliers").param("band", "LT_80"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-U1"));
    }

    @Test
    void returns_only_the_overpaid_when_asked_for_the_high_band() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("band", "GT_120"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-I3"))
                .andExpect(jsonPath("$.content[1].employeeNumber").value("F-U4"));
    }

    @Test
    void returns_both_directions_when_no_band_is_named() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void rejects_a_band_that_is_not_an_outlier_band() throws Exception {
        // 90-110% employees are within band by definition and are not outliers.
        mvc.perform(get("/api/analytics/outliers").param("band", "B90_110"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("LT_80")));
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./mvnw test -Dtest=OutliersApiTest`
Expected: FAIL — `band` is ignored, so all four return the unfiltered three.

- [ ] **Step 3: Implement the backend change**

`src/main/java/com/payscope/analytics/OutlierBand.java`
```java
package com.payscope.analytics;

import com.payscope.common.DomainException;

/** The two directions of the outlier window. In-band ranges are not outliers. */
public enum OutlierBand {
    LT_80, GT_120;

    public static OutlierBand parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("'" + value
                    + "' is not an outlier band. Permitted values: LT_80, GT_120");
        }
    }
}
```

In `AnalyticsRepository`, replace the fixed `OUTLIER_PREDICATE` with one chosen by band:
```java
    private static String outlierPredicate(OutlierBand band) {
        if (band == OutlierBand.LT_80) {
            return "  and b.band_mid is not null and s.amount_original / b.band_mid < :low\n";
        }
        if (band == OutlierBand.GT_120) {
            return "  and b.band_mid is not null and s.amount_original / b.band_mid > :high\n";
        }
        return OUTLIER_PREDICATE;
    }
```
Thread `OutlierBand band` through `outliers(...)`, use `outlierPredicate(band)` in both the page and count queries, and keep binding both `:low` and `:high` — binding an unused parameter is harmless and keeps `bindOutlier` unchanged.

Add `@RequestParam(required = false) String band` to the controller method and pass `OutlierBand.parse(band)` down through the service.

- [ ] **Step 4: Run it to verify it passes**

Run: `./mvnw test -Dtest=OutliersApiTest`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit the backend change on its own**

```bash
git add src/main/java/com/payscope/analytics src/test/java/com/payscope/analytics/OutliersApiTest.java
git commit -m "feat: allow the outlier list to be narrowed to one direction

The insights histogram lets a reader click the underpaid or overpaid bar.
Filtering the returned page in the browser would filter one page rather
than the set, so the paginator would report a total that did not match
what was shown. One optional parameter closes that properly.

In-band ranges are rejected: an employee between 90 and 110 percent is
within band by definition and is not an outlier."
```

- [ ] **Step 6: Write the failing frontend test**

`web/src/app/insights/outlier-table.component.spec.ts`
```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { InsightsStore } from './insights.store';
import { OutlierTableComponent } from './outlier-table.component';

const PAGE = {
  content: [
    {
      employeeId: 5, employeeNumber: 'F-U1', fullName: 'Engineer F-U1', countryCode: 'US',
      role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
      salary: { amount: '103950.00', currency: 'USD' },
      bandMid: { amount: '148500.00', currency: 'USD' }, compaRatio: '0.7000',
    },
  ],
  page: 0, size: 25, totalElements: 1, totalPages: 1,
};

describe('OutlierTableComponent', () => {
  let mock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutlierTableComponent],
      providers: [
        InsightsStore,
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  function render(selectedBucket: string | null = null) {
    const fixture = TestBed.createComponent(OutlierTableComponent);
    fixture.componentRef.setInput('selectedBucket', selectedBucket);
    fixture.detectChanges();
    return fixture;
  }

  it('shows each outlier in their own currency against their own band', fakeAsync(() => {
    const fixture = render();
    tick();
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(PAGE);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    // Compa-ratio never crosses a currency: both figures are local.
    expect(text).toContain('$103,950.00');
    expect(text).toContain('$148,500.00');
    expect(text).toContain('0.7000');
  }));

  it('asks the server for one direction when a bar is selected', fakeAsync(() => {
    const fixture = render();
    tick();
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(PAGE);

    fixture.componentRef.setInput('selectedBucket', 'LT_80');
    fixture.detectChanges();
    tick();

    // Not filtered in the browser: filtering a page would make the paginator lie.
    const request = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(request.request.params.get('band')).toBe('LT_80');
    request.flush(PAGE);
  }));

  it('explains that an in-band selection has nothing to review', fakeAsync(() => {
    const fixture = render();
    tick();
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(PAGE);

    fixture.componentRef.setInput('selectedBucket', 'B90_110');
    fixture.detectChanges();
    tick();

    expect(fixture.nativeElement.textContent).toContain('within band');
    mock.expectNone(r => r.url === '/api/analytics/outliers');
  }));

  it('says everyone is within band rather than showing an empty table', fakeAsync(() => {
    const fixture = render();
    tick();
    mock.expectOne(r => r.url === '/api/analytics/outliers')
      .flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Everyone with a pay band is inside it');
  }));
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL — the placeholder renders nothing.

- [ ] **Step 8: Implement the outlier table**

First amend the API service and the store, since the component calls into both.

`AnalyticsApiService.outliers` gains a band argument:
```ts
  outliers(
    filters: AnalyticsFilterValues,
    page: number,
    size: number,
    band: OutlierBand | null,
  ): Observable<OutlierPage> {
    let params = toParams(filters).set('page', page).set('size', size);
    if (band) {
      params = params.set('band', band);
    }
    return this.http.get<OutlierPage>('/api/analytics/outliers', { params });
  }
```
with `export type OutlierBand = 'LT_80' | 'GT_120';` added to `analytics.models.ts`.

`InsightsStore` gains the signal, folds it into the request, and exposes a setter:
```ts
  readonly outlierBand = signal<OutlierBand | null>(null);

  readonly outliers = toSignal<RequestState<OutlierPage>>(
    toObservable(
      computed(() => ({
        filters: this.filters(),
        page: this.outlierPage(),
        size: this.outlierSize(),
        band: this.outlierBand(),
      })),
    ).pipe(switchMap(({ filters, page, size, band }) =>
      track(this.api.outliers(filters, page, size, band)))),
    { initialValue: loading<OutlierPage>() },
  );

  setOutlierBand(band: OutlierBand | null): void {
    this.outlierBand.set(band);
    // A narrower band is a shorter list; page 4 of it may not exist.
    this.outlierPage.set(0);
  }
```
Then:

`web/src/app/insights/outlier-table.component.ts`
```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { titleCase } from '../shared/reference';
import { InsightsStore } from './insights.store';
import { CompaRatioBucketKey } from './analytics.models';

/** Only the two edge bands are outlier bands; the rest are within band by definition. */
const OUTLIER_BANDS: ReadonlyArray<CompaRatioBucketKey> = ['LT_80', 'GT_120'];

@Component({
  selector: 'app-outlier-table',
  standalone: true,
  imports: [MatTableModule, MatPaginatorModule, RouterLink, MoneyPipe, StatePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Employees outside their band</h2>

    @if (isInBandSelection()) {
      <p class="note">
        Those employees are within band, so there is nothing to review here. Select the
        under-80% or over-120% bar to see people who need attention.
      </p>
    } @else {
      <app-state-panel
        [state]="store.outliers()"
        [isEmpty]="rows().length === 0"
        emptyMessage="Everyone with a pay band is inside it." />

      @if (rows().length > 0) {
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let row">
              <a [routerLink]="['/employees', row.employeeId]">{{ row.fullName }}</a>
              <span class="muted">{{ row.employeeNumber }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Role</th>
            <td mat-cell *matCellDef="let row">
              {{ label(row.role) }}<span class="muted">{{ label(row.level) }} · {{ row.countryCode }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="salary">
            <th mat-header-cell *matHeaderCellDef>Salary</th>
            <td mat-cell *matCellDef="let row">{{ row.salary | money }}</td>
          </ng-container>
          <ng-container matColumnDef="bandMid">
            <th mat-header-cell *matHeaderCellDef>Band midpoint</th>
            <td mat-cell *matCellDef="let row">{{ row.bandMid | money }}</td>
          </ng-container>
          <ng-container matColumnDef="compaRatio">
            <th mat-header-cell *matHeaderCellDef>Compa-ratio</th>
            <td mat-cell *matCellDef="let row"><strong>{{ row.compaRatio }}</strong></td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>

        <mat-paginator
          [length]="total()"
          [pageIndex]="store.outlierPage()"
          [pageSize]="store.outlierSize()"
          [pageSizeOptions]="[10, 25, 50, 100]"
          (page)="onPage($event)" />
      }
    }
  `,
  styles: [`
    :host { display: block; margin-top: 2rem; }
    table { width: 100%; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
    .note { opacity: .75; max-width: 48rem; }
  `],
})
export class OutlierTableComponent {
  readonly selectedBucket = input<CompaRatioBucketKey | null>(null);

  protected readonly store = inject(InsightsStore);
  protected readonly columns = ['name', 'role', 'salary', 'bandMid', 'compaRatio'];
  protected readonly label = titleCase;

  protected readonly isInBandSelection = computed(() => {
    const bucket = this.selectedBucket();
    return bucket !== null && !OUTLIER_BANDS.includes(bucket);
  });

  constructor() {
    effect(() => {
      const bucket = this.selectedBucket();
      // An in-band selection asks for no request at all; the message explains why.
      if (!this.isInBandSelection()) {
        this.store.setOutlierBand(bucket as 'LT_80' | 'GT_120' | null);
      }
    });
  }

  protected rows() {
    const state = this.store.outliers();
    return state.status === 'ready' ? state.data.content : [];
  }

  protected total(): number {
    const state = this.store.outliers();
    return state.status === 'ready' ? state.data.totalElements : 0;
  }

  protected onPage(event: PageEvent): void {
    this.store.setOutlierPage(event.pageIndex);
  }
}
```

- [ ] **Step 9: Run the full frontend suite**

Run: `npm test --prefix web`
Expected: PASS, every spec.

- [ ] **Step 10: Verify the whole thing by hand**

```bash
docker compose up --build
```
Open `http://localhost:4200` (or the composed app) and confirm: the list pages through 10,000 employees, a filtered view survives a refresh, opening an employee shows their band, the insights charts draw, and clicking the under-80% bar narrows the outlier table with a total that matches the rows shown.

- [ ] **Step 11: Commit**

```bash
git add web/src/app/insights
git commit -m "feat: add the outlier table with cross-filtering from the histogram

Clicking an edge bar narrows the list through the server rather than
filtering the page in the browser, so the total the paginator reports
always matches the rows on screen.

Selecting an in-band bar issues no request and says why: those employees
are within band and there is nothing to review."
```

---

## Spec coverage

| Spec §10 requirement | Tasks |
|---|---|
| Signal-based stores, RxJS only at the HTTP boundary | 3, 6, 8 |
| `switchMap` cancellation of superseded searches | 3 |
| URL as the source of truth for list state | 3 (mapping), 5 (router wiring) |
| Three lazy feature routes | 1 |
| Employee list — table, paginator, filters, search, compa-ratio badge | 5 |
| Employee detail — two tabs, lazily fetched history, band shown beside the ratio | 6, 7 |
| Insights — summary tiles, group-by capped at two, charts, outlier table | 8, 9, 10 |
| Shared filter bar used by both areas | 4, 5, 9 |
| `ProblemDetail` interceptor, field errors bound to controls, snackbar otherwise | 2, 6 |
| 409 shows a reload prompt and is never retried | 6, 7 |
| Money stays a string; no arithmetic in the browser | 2, 9 (the one bounded exception, tested) |
| Loading, empty and error as distinct states on every screen | 4, 5, 6, 7, 9, 10 |
| Jest with Material harnesses; a test that a superseded request is cancelled | 1, 3 |
| Zoneless decision | 1 (adopted), 9 (verified or reverted) |

**One item deliberately not built:** spec §10 mentions Angular Material *component harnesses*. Most specs here assert against rendered text and component state instead, which is simpler and equally resilient. Use a harness where a test needs to drive a Material control's internals — opening a `mat-select`, for instance — rather than as a blanket style.

**One change to a committed plan:** Task 10 amends the backend's `/analytics/outliers` with an optional `band` parameter. The backend plan predates the histogram's click-to-filter behaviour, and filtering in the browser would have made the paginator report a total that did not match the rows shown.

---

## Definition of done

- [ ] `npm test --prefix web` passes in full.
- [ ] `./mvnw test` still passes after the Task 10 backend change.
- [ ] A test asserts a superseded search request is cancelled, not merely ignored.
- [ ] A test asserts money formats without passing through a double.
- [ ] A filtered list URL can be copied into a new tab and restores the same view.
- [ ] A 409 shows a reload prompt; no code path retries one.
- [ ] `docker compose up --build` serves the app against 10,000 seeded employees.
- [ ] ADR-0008 exists **only if** zoneless was verified against rendered charts.
- [ ] No remote is configured. Nothing has been pushed.
- [ ] No commit message contains an AI attribution trailer.
