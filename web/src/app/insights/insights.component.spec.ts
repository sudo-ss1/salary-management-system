import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { InsightsComponent } from './insights.component';

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
        provideRouter([]),
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  /**
   * InsightsStore fires all three of its requests as soon as it is
   * constructed. Flushed here so mock.verify() has nothing outstanding;
   * a test that goes on to call detectChanges() again (e.g. after a bucket
   * selection) is responsible for flushing whatever that triggers too.
   */
  function createAndFlush() {
    const fixture = TestBed.createComponent(InsightsComponent);
    fixture.detectChanges();
    tick();

    mock.expectOne(r => r.url === '/api/analytics/summary').flush({
      headcount: 0, totalCostToCompanyUsd: { amount: '0.00', currency: 'USD' },
      meanBaseUsd: { amount: '0.00', currency: 'USD' }, unbandedCount: 0, compaRatioBuckets: [],
    });
    mock.expectOne(r => r.url === '/api/analytics/distribution').flush([]);
    mock.expectOne(r => r.url === '/api/analytics/outliers').flush(
      { content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });

    return fixture;
  }

  it('clears the outlier band and re-requests the unfiltered list when the same bar is toggled off', fakeAsync(() => {
    const fixture = createAndFlush();
    const instance = fixture.componentInstance;

    // Selecting a bar flows down to OutlierTableComponent's input, which
    // asks the store to narrow the outlier list - proving the toggle by
    // itself, not merely the component's own private signal.
    instance['onBucketSelected']('LT_80');
    fixture.detectChanges();
    tick();

    const filteredRequest = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(filteredRequest.request.params.get('band')).toBe('LT_80');
    filteredRequest.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });

    instance['onBucketSelected']('LT_80');
    fixture.detectChanges();
    tick();

    expect(instance['store'].outlierBand()).toBeNull();
    const clearedRequest = mock.expectOne(r => r.url === '/api/analytics/outliers');
    expect(clearedRequest.request.params.has('band')).toBe(false);
    clearedRequest.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0 });
  }));

  it('replaces the selection when a different bar is selected, rather than toggling it off', fakeAsync(() => {
    const fixture = createAndFlush();
    const instance = fixture.componentInstance;

    instance['onBucketSelected']('LT_80');
    instance['onBucketSelected']('GT_120');

    expect(instance['selectedBucket']()).toBe('GT_120');
  }));

  it('labels a group the same way the chart does, so the table row does not disagree with the bar above it', fakeAsync(() => {
    const fixture = createAndFlush();
    const instance = fixture.componentInstance;

    // Previously this joined raw values ("BR · JUNIOR"), while the chart
    // title-cased everything but the country ("BR · Junior") - two labels
    // for the same group, one directly above the other.
    expect(instance['groupLabel']({ key: { country: 'BR', level: 'JUNIOR' } })).toBe('BR · Junior');
  }));
});
