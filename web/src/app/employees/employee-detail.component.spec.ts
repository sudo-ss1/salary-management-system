import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
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
        // id() is input.required<string>(), bound from the route - without
        // withComponentInputBinding() every test below would fail with
        // "Input is required but no value is available".
        provideRouter(
          [{ path: 'employees/:id', component: EmployeeDetailComponent }],
          withComponentInputBinding(),
        ),
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
