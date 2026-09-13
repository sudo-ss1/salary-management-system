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
   * constructed. Flushed here and not touched again - none of the tests
   * below call detectChanges() afterwards, so no follow-up request (e.g. the
   * outlier band request a bucket selection would trigger) is ever issued,
   * and mock.verify() has nothing left over to complain about.
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

  it('toggles a bucket selection off when the same bar is selected again', fakeAsync(() => {
    const fixture = createAndFlush();
    const instance = fixture.componentInstance;

    instance['onBucketSelected']('LT_80');
    expect(instance['selectedBucket']()).toBe('LT_80');

    instance['onBucketSelected']('LT_80');
    expect(instance['selectedBucket']()).toBeNull();
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
