import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location } from '@angular/common';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { InsightsComponent } from './insights.component';

const SUMMARY = {
  headcount: 0, totalCostToCompanyUsd: { amount: '0.00', currency: 'USD' },
  meanBaseUsd: { amount: '0.00', currency: 'USD' }, unbandedCount: 0, compaRatioBuckets: [],
};
const EMPTY_OUTLIER_PAGE = { content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 };

describe('InsightsComponent', () => {
  let mock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightsComponent],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        // OutlierTableComponent links to the employee detail page, which needs
        // a router in place (RouterLink injects ActivatedRoute unconditionally).
        provideRouter([{ path: 'insights', component: InsightsComponent }]),
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  async function open(url = '/insights'): Promise<RouterTestingHarness> {
    return RouterTestingHarness.create(url);
  }

  /**
   * InsightsStore fires all three of its requests as soon as it is
   * constructed. Flushed here so mock.verify() has nothing outstanding;
   * a test that goes on to call detectChanges() again (e.g. after a bucket
   * selection) is responsible for flushing whatever that triggers too.
   */
  function flushCreation(): void {
    mock.expectOne(r => r.url === '/api/analytics/summary').flush(SUMMARY);
    mock.expectOne(r => r.url === '/api/analytics/distribution').flush([]);
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(EMPTY_OUTLIER_PAGE);
  }

  async function createAndFlush(url = '/insights'): Promise<RouterTestingHarness> {
    const harness = await open(url);
    tick();
    flushCreation();
    return harness;
  }

  function instanceOf(harness: RouterTestingHarness): InsightsComponent {
    return harness.routeDebugElement!.componentInstance as InsightsComponent;
  }

  it('clears the outlier band and re-requests the unfiltered list when the same bar is toggled off', fakeAsync(async () => {
    const harness = await createAndFlush();
    const instance = instanceOf(harness);

    // Selecting a bar flows down to OutlierTableComponent's input, which
    // asks the store to narrow the outlier list - proving the toggle by
    // itself, not merely the component's own private signal.
    instance['onBucketSelected']('LT_80');
    harness.detectChanges();
    tick();

    const filteredRequest = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(filteredRequest.request.params.get('band')).toBe('LT_80');
    filteredRequest.flush(EMPTY_OUTLIER_PAGE);

    instance['onBucketSelected']('LT_80');
    harness.detectChanges();
    tick();

    expect(instance['store'].outlierBand()).toBeNull();
    const clearedRequest = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(clearedRequest.request.params.has('band')).toBe(false);
    clearedRequest.flush(EMPTY_OUTLIER_PAGE);
  }));

  it('replaces the selection when a different bar is selected, rather than toggling it off', fakeAsync(async () => {
    const harness = await createAndFlush();
    const instance = instanceOf(harness);

    instance['onBucketSelected']('LT_80');
    harness.detectChanges();
    tick();
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(EMPTY_OUTLIER_PAGE);

    instance['onBucketSelected']('GT_120');
    harness.detectChanges();
    tick();

    expect(instance['selectedBucket']()).toBe('GT_120');
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(EMPTY_OUTLIER_PAGE);
  }));

  it('labels a group the same way the chart does, so the table row does not disagree with the bar above it', fakeAsync(async () => {
    const harness = await createAndFlush();
    const instance = instanceOf(harness);

    // Previously this joined raw values ("BR · JUNIOR"), while the chart
    // title-cased everything but the country ("BR · Junior") - two labels
    // for the same group, one directly above the other.
    expect(instance['groupLabel']({ key: { country: 'BR', level: 'JUNIOR' } })).toBe('BR · Junior');
  }));

  it('restores filters, group-by and the outlier band from the url so the first requests already go out filtered', fakeAsync(async () => {
    await open(
      '/insights?country=IN&level=SENIOR&groupBy=COUNTRY&groupBy=LEVEL&outlierBand=LT_80&outlierPage=1',
    );
    tick();

    const summaryRequest = mock.expectOne(r => r.url === '/api/analytics/summary');
    expect(summaryRequest.request.params.get('country')).toBe('IN');
    expect(summaryRequest.request.params.get('level')).toBe('SENIOR');
    summaryRequest.flush(SUMMARY);

    const distributionRequest = mock.expectOne(r => r.url === '/api/analytics/distribution');
    expect(distributionRequest.request.params.get('country')).toBe('IN');
    expect(distributionRequest.request.params.get('level')).toBe('SENIOR');
    expect(distributionRequest.request.params.getAll('groupBy')).toEqual(['COUNTRY', 'LEVEL']);
    distributionRequest.flush([]);

    const outliersRequest = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(outliersRequest.request.params.get('country')).toBe('IN');
    expect(outliersRequest.request.params.get('band')).toBe('LT_80');
    expect(outliersRequest.request.params.get('page')).toBe('1');
    outliersRequest.flush({ ...EMPTY_OUTLIER_PAGE, page: 1 });
  }));

  it('derives the selected histogram bucket from the restored outlier band, rather than storing it twice', fakeAsync(async () => {
    const harness = await createAndFlush('/insights?outlierBand=GT_120');
    const instance = instanceOf(harness);

    expect(instance['selectedBucket']()).toBe('GT_120');
  }));

  it('caps a hand-edited url asking for three group-by dimensions at two, rather than throwing an unhandled error', fakeAsync(async () => {
    // If applyQueryParams let the third dimension through, InsightsStore's
    // own cap would throw synchronously inside the constructor, and this
    // navigation would never resolve.
    const harness = await open('/insights?groupBy=COUNTRY&groupBy=LEVEL&groupBy=ROLE');
    tick();
    flushCreation();

    expect(instanceOf(harness)['store'].groupBy()).toEqual(['COUNTRY', 'LEVEL']);
  }));

  it('falls back to no outlier band when the url names a bucket that is not a valid band', fakeAsync(async () => {
    const harness = await createAndFlush('/insights?outlierBand=B90_110');

    expect(instanceOf(harness)['store'].outlierBand()).toBeNull();
    expect(instanceOf(harness)['selectedBucket']()).toBeNull();
  }));

  it('writes filter and group-by changes back to the url', fakeAsync(async () => {
    const harness = await createAndFlush();

    instanceOf(harness)['store'].setFilter('country', 'IN');
    instanceOf(harness)['store'].setGroupBy(['COUNTRY', 'LEVEL']);
    // detectChanges() flushes InsightsStore's own request effects (it is
    // provided at component level, not root, so nothing flushes them until
    // this component's view is refreshed) - only then do the three requests
    // reflecting the new filter and group-by actually exist to flush.
    harness.detectChanges();
    tick();
    mock.match(r => r.url === '/api/analytics/summary').forEach(r => r.flush(SUMMARY));
    mock.match(r => r.url === '/api/analytics/distribution').forEach(r => r.flush([]));
    mock.match(r => r.url === '/api/analytics/outliers').forEach(r => r.flush(EMPTY_OUTLIER_PAGE));
    harness.detectChanges();
    tick();

    const path = TestBed.inject(Location).path();
    expect(path).toContain('country=IN');
    expect(path).toContain('groupBy=COUNTRY');
    expect(path).toContain('groupBy=LEVEL');
  }));
});
