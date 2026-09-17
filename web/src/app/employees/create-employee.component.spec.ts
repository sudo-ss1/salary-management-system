import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { CreateEmployeeComponent } from './create-employee.component';

/** Stands in for the real employee detail route, so navigation has somewhere to land. */
@Component({ selector: 'app-employee-detail-stub', standalone: true, template: 'employee {{ id }}' })
class EmployeeDetailStubComponent {}

describe('CreateEmployeeComponent', () => {
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        // The datepicker needs an adapter; app.config.ts provides it in the
        // app, but a TestBed builds its own injector.
        provideNativeDateAdapter(),
        provideRouter([
          { path: 'employees/new', component: CreateEmployeeComponent },
          { path: 'employees/:id', component: EmployeeDetailStubComponent },
        ]),
      ],
    });
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  function fillForm(harness: RouterTestingHarness): void {
    const component = harness.routeDebugElement!.componentInstance as CreateEmployeeComponent;
    component.form = {
      employeeNumber: 'E-3001', fullName: 'Priya Nair', email: 'priya@acme.test',
      department: 'ENGINEERING', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
      employmentType: 'FULL_TIME', hireDate: new Date(2024, 2, 1), salaryAmount: '3500000.00',
      salaryEffectiveFrom: new Date(2024, 2, 1),
    };
    component.onCountryChange('IN');
  }

  it('posts the full body with the salary as a string and the derived currency, then navigates to the created id', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();
    fillForm(harness);
    harness.detectChanges();

    (harness.routeDebugElement!.componentInstance as CreateEmployeeComponent).onSubmit();

    const request = mock.expectOne('/api/employees');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      employeeNumber: 'E-3001', fullName: 'Priya Nair', email: 'priya@acme.test',
      department: 'ENGINEERING', countryCode: 'IN', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
      employmentType: 'FULL_TIME', hireDate: '2024-03-01',
      salary: { amount: '3500000.00', currency: 'INR' },
      salaryEffectiveFrom: '2024-03-01',
    });
    // Never a number: this is the same string literal typed above, not the
    // result of some parseFloat/toString round trip that would merely look equal.
    expect(typeof request.request.body.salary.amount).toBe('string');

    request.flush(null, {
      status: 201, statusText: 'Created', headers: { Location: '/api/employees/42' },
    });
    tick();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/employees/42');
  }));

  it('shows the derived currency once a country is chosen, not merely a signal value', async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();

    const before = harness.routeNativeElement!.textContent!;
    expect(before).not.toContain('INR');

    (harness.routeDebugElement!.componentInstance as CreateEmployeeComponent).onCountryChange('IN');
    harness.detectChanges();

    const amountField = harness.routeNativeElement!.querySelector('input[inputmode="decimal"]');
    expect(amountField).not.toBeNull();
    const formField = amountField!.closest('mat-form-field');
    expect(formField!.textContent).toContain('INR');
  });

  it('changes the shown currency when a different country is chosen', async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();

    const component = harness.routeDebugElement!.componentInstance as CreateEmployeeComponent;
    component.onCountryChange('IN');
    harness.detectChanges();
    component.onCountryChange('GB');
    harness.detectChanges();

    const amountField = harness.routeNativeElement!.querySelector('input[inputmode="decimal"]');
    const formField = amountField!.closest('mat-form-field');
    expect(formField!.textContent).toContain('GBP');
    expect(formField!.textContent).not.toContain('INR');
  });

  it('binds a 400 field error to its offending control', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();
    fillForm(harness);
    harness.detectChanges();

    (harness.routeDebugElement!.componentInstance as CreateEmployeeComponent).onSubmit();
    mock.expectOne('/api/employees').flush(
      {
        title: 'Validation failed', detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    harness.detectChanges();
    tick();

    const emailField = harness.routeNativeElement!.querySelector('input[type="email"]');
    const formField = emailField!.closest('mat-form-field');
    expect(formField!.textContent).toContain('must be a well-formed email address');
  }));

  it('shows a duplicate email 409 message where the user can see it', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();
    fillForm(harness);
    harness.detectChanges();

    (harness.routeDebugElement!.componentInstance as CreateEmployeeComponent).onSubmit();
    mock.expectOne('/api/employees').flush(
      {
        title: 'Conflict', detail: 'That email address is already in use',
        conflictKind: 'UNIQUE_CONSTRAINT',
      },
      { status: 409, statusText: 'Conflict' },
    );
    harness.detectChanges();
    tick();

    // The regression guard for the Critical defect: assert what is actually
    // visible on the page, not the store's fieldErrors signal (which is empty
    // here - a 409 uniqueness conflict carries no field errors at all).
    expect(document.body.textContent).toContain('That email address is already in use');
  }));

  it('does not navigate away when the request fails', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/new');
    harness.detectChanges();
    fillForm(harness);
    harness.detectChanges();

    (harness.routeDebugElement!.componentInstance as CreateEmployeeComponent).onSubmit();
    mock.expectOne('/api/employees').flush(
      { title: 'Conflict', detail: 'That email address is already in use', conflictKind: 'UNIQUE_CONSTRAINT' },
      { status: 409, statusText: 'Conflict' },
    );
    harness.detectChanges();
    tick();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/employees/new');
  }));
});
