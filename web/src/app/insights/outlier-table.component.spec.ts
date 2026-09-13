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
