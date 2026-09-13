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

/**
 * toObservable() feeds a root effect, and a root effect does not run
 * synchronously when created or when a signal it reads changes - it only
 * runs once Angular flushes pending effects. In the real (zoneless) app,
 * the change-detection scheduler does that for us continuously. Here, with
 * the store built in a plain (non-fakeAsync) beforeEach and no component
 * fixture ever created, nothing ever calls that flush automatically -
 * fakeAsync's tick() cannot substitute for it either, because the flush the
 * scheduler *would* have scheduled is a real setTimeout/requestAnimationFrame
 * race owned by whichever zone was active the moment it was requested, never
 * the fake one tick() controls. TestBed.tick() runs pending effects
 * synchronously, in whatever zone calls it, which is what tick()-driven
 * assertions here actually need. Delete this and the store looks identical -
 * but every request past the first stops arriving.
 */
function settle(): void {
  TestBed.tick();
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
    settle();
    tick(300);
    const request = mock.expectOne(r => r.url === '/api/employees');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('25');
    expect(request.request.params.get('sort')).toBe('FULL_NAME');
    request.flush(pageOf('Asha Menon'));
  }));

  it('cancels a superseded search rather than rendering a query the user has left', fakeAsync(() => {
    settle();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setSearch('Jo');
    settle();
    tick(300);
    settle();
    const stale = mock.expectOne(r => r.params.get('q') === 'Jo');

    store.setSearch('John');
    settle();
    tick(300);
    settle();
    const current = mock.expectOne(r => r.params.get('q') === 'John');

    // The first request is unsubscribed by switchMap, so a late response for
    // "Jo" can never repaint the table.
    expect(stale.cancelled).toBe(true);

    current.flush(pageOf('John Carter'));
    const state = store.state();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && state.data.content[0].fullName).toBe('John Carter');
  }));

  it('waits for typing to settle before asking the server', fakeAsync(() => {
    settle();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setSearch('J');
    settle();
    tick(100);
    store.setSearch('Jo');
    settle();
    tick(100);
    store.setSearch('Joh');
    settle();
    tick(300);
    settle();

    // One request for the settled text, not three for the keystrokes.
    const requests = mock.match(r => r.url === '/api/employees');
    expect(requests.length).toBe(1);
    expect(requests[0].request.params.get('q')).toBe('Joh');
    requests[0].flush(pageOf());
  }));

  it('returns to the first page whenever a filter changes', fakeAsync(() => {
    settle();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setPage(4);
    settle();
    tick(300);
    mock.expectOne(r => r.params.get('page') === '4').flush(pageOf());

    store.setFilter('country', 'IN');
    settle();
    tick(300);

    // Staying on page 5 of a narrower result set would show an empty table.
    const request = mock.expectOne(r => r.params.get('country') === 'IN');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(pageOf());
  }));

  it('keeps the current page when only the page changes', fakeAsync(() => {
    settle();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setPage(2);
    settle();
    tick(300);
    mock.expectOne(r => r.params.get('page') === '2').flush(pageOf());
    expect(store.page()).toBe(2);
  }));

  it('omits filters that are not set rather than sending empty strings', fakeAsync(() => {
    settle();
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
    settle();
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
    settle();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(pageOf());

    store.setFilter('country', 'IN');
    store.setFilter('level', 'SENIOR');
    store.setSort('SALARY', 'desc');
    store.setPage(3);
    settle();
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

    settle();
    tick(300);
    mock.match(() => true).forEach(r => r.flush(pageOf()));
  }));

  afterEach(() => mock.verify());
});
