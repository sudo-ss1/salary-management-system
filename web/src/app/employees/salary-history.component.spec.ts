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
