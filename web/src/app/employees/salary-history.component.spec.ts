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

  // Two distinct rows, in the order the server sends them (newest first, per
  // the API contract - the component does no client-side sorting).
  const TWO_ROWS = [
    {
      salary: { amount: '4640625.00', currency: 'INR' },
      salaryBaseUsd: { amount: '55687.50', currency: 'USD' },
      effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', changeReason: 'Promotion',
    },
    {
      salary: { amount: '3712500.00', currency: 'INR' },
      salaryBaseUsd: { amount: '44550.00', currency: 'USD' },
      effectiveFrom: '2024-03-01', effectiveTo: '2026-01-01', changeReason: 'Annual review',
    },
  ];

  function dataRows(fixture: ReturnType<typeof render>): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('table tr')).filter(
      (tr): tr is HTMLTableRowElement => (tr as HTMLElement).querySelector('td') !== null,
    );
  }

  it('renders history rows in the order the server returns them, newest first', () => {
    const fixture = render();
    mock.expectOne('/api/employees/7/salary-history').flush(TWO_ROWS);
    fixture.detectChanges();

    const rows = dataRows(fixture);
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('2026-01-01');
    expect(rows[1].textContent).toContain('2024-03-01');
  });

  it('keeps each row\'s local and USD amounts together, not merely both present on the page', () => {
    const fixture = render();
    mock.expectOne('/api/employees/7/salary-history').flush(TWO_ROWS);
    fixture.detectChanges();

    const rows = dataRows(fixture);
    expect(rows[0].textContent).toContain('₹4,640,625.00');
    expect(rows[0].textContent).toContain('$55,687.50');
    expect(rows[0].textContent).not.toContain('₹3,712,500.00');
    expect(rows[0].textContent).not.toContain('$44,550.00');

    expect(rows[1].textContent).toContain('₹3,712,500.00');
    expect(rows[1].textContent).toContain('$44,550.00');
    expect(rows[1].textContent).not.toContain('₹4,640,625.00');
    expect(rows[1].textContent).not.toContain('$55,687.50');
  });

  it('cancels a superseded history request when the employee changes before it answers', () => {
    const fixture = render(7);
    const first = mock.expectOne('/api/employees/7/salary-history');

    // EmployeeDetailComponent reuses this component's host across employees
    // (its own id-effect is proof the instance survives a route-id change),
    // so without cancellation a slow response for 7 could land after 8's
    // and repaint employee 7's history under employee 8's name.
    fixture.componentRef.setInput('employeeId', 8);
    fixture.detectChanges();
    const second = mock.expectOne('/api/employees/8/salary-history');

    expect(first.cancelled).toBe(true);

    second.flush([
      {
        salary: { amount: '5000000.00', currency: 'INR' },
        salaryBaseUsd: { amount: '60000.00', currency: 'USD' },
        effectiveFrom: '2025-01-01', effectiveTo: '2026-01-01', changeReason: 'Employee 8 raise',
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Employee 8 raise');
  });
});
