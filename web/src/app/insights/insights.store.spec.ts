import { TestBed, fakeAsync } from '@angular/core/testing';
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
 * but every request past the first stops arriving. (Copied from
 * employee-list.store.spec.ts, where this was first worked out.)
 */
function settle(): void {
  TestBed.tick();
}

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
    settle();
    expect(mock.match(r => r.url === '/api/analytics/summary').length).toBe(1);
    expect(mock.match(r => r.url === '/api/analytics/distribution').length).toBe(1);
    expect(mock.match(r => r.url === '/api/analytics/outliers').length).toBe(1);
    // match() consumed them; flush a fresh set is unnecessary here.
  }));

  it('groups by country out of the box, because that is the question most often asked', fakeAsync(() => {
    settle();
    const request = mock.expectOne(r => r.url === '/api/analytics/distribution');
    expect(request.request.params.getAll('groupBy')).toEqual(['COUNTRY']);
    request.flush([]);
    // Each remaining request flushed with its own correctly-shaped fixture,
    // not swept up by a blanket match() that would hand the outliers request
    // a summary-shaped body.
    mock.expectOne(r => r.url === '/api/analytics/summary').flush(SUMMARY);
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(
      { content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });
  }));

  it('sends both dimensions when two are selected', fakeAsync(() => {
    settle();
    flushAll();

    store.setGroupBy(['COUNTRY', 'LEVEL']);
    settle();

    const request = mock.expectOne(r => r.url === '/api/analytics/distribution');
    expect(request.request.params.getAll('groupBy')).toEqual(['COUNTRY', 'LEVEL']);
    request.flush([]);
  }));

  it('refuses a third dimension locally rather than letting the server reject it', fakeAsync(() => {
    settle();
    flushAll();

    expect(() => store.setGroupBy(['COUNTRY', 'LEVEL', 'ROLE'] as never))
      .toThrow('Group by at most two dimensions, was given 3');
    // A cap that throws but mutates state anyway would still be a bug.
    expect(store.groupBy()).toEqual(['COUNTRY']);
  }));

  it('applies one filter change to all three views at once', fakeAsync(() => {
    settle();
    flushAll();

    store.setFilter('country', 'IN');
    settle();

    expect(mock.expectOne(r => r.url === '/api/analytics/summary')
      .request.params.get('country')).toBe('IN');
    expect(mock.expectOne(r => r.url === '/api/analytics/distribution')
      .request.params.get('country')).toBe('IN');
    expect(mock.expectOne(r => r.url === '/api/analytics/outliers')
      .request.params.get('country')).toBe('IN');
    flushAll();
  }));

  it('returns the outlier list to its first page when a filter changes', fakeAsync(() => {
    settle();
    flushAll();

    store.setOutlierPage(3);
    settle();
    // Fixed from the brief: this predicate receives the raw HttpRequest, not
    // the TestRequest wrapper, so it is `r.params`, not `r.request.params`.
    mock.expectOne(r => r.params.get('page') === '3').flush(
      { content: [], page: 3, size: 25, totalElements: 0, totalPages: 0 });

    store.setFilter('level', 'SENIOR');
    settle();
    const request = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(request.request.params.get('page')).toBe('0');
    flushAll();
  }));

  it('exposes an error state per view, so one failure does not blank the screen', fakeAsync(() => {
    settle();
    mock.expectOne(r => r.url === '/api/analytics/summary').flush(SUMMARY);
    mock.expectOne(r => r.url === '/api/analytics/distribution')
      .flush({ title: 'Something went wrong', detail: 'The request could not be completed.' },
             { status: 500, statusText: 'Server Error' });
    mock.expectOne(r => r.url === '/api/analytics/outliers')
      .flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });

    expect(store.summary().status).toBe('ready');
    expect(store.distribution().status).toBe('error');
    expect(store.outliers().status).toBe('ready');
  }));
});
