import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeDetailComponent } from './employee-detail.component';

/** Stands in for the real employees list route, so navigate(['/employees']) has somewhere to land. */
@Component({ selector: 'app-employees-list-stub', standalone: true, template: 'employees list' })
class EmployeesListStubComponent {}

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

    // The @if (store.conflict()) gate is only proven by exercising both
    // branches - a successful load with no conflict must show no banner.
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  }));

  it('shows hire date, employee number and status as read-only facts about the record', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    // requirements.md section 3 lists these as part of every employee record;
    // they are facts about the record, not editable fields in this form, so
    // there is no input to bind them to - just visible text.
    const text = harness.routeNativeElement!.textContent!;
    expect(text).toContain('E-007');
    expect(text).toContain('2024-03-01');
    expect(text).toContain('Active');
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

  it('shows the full name validation error inline instead of failing silently', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    harness.routeDebugElement!.componentInstance.onSave();
    mock.expectOne(r => r.method === 'PUT').flush(
      {
        title: 'Bad Request',
        detail: 'One or more fields are invalid',
        errors: [{ field: 'fullName', message: 'must not be blank' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    harness.detectChanges();
    tick();

    // Nothing renders this today: the snackbar is suppressed because
    // fieldErrors is non-empty, and no control binds "fullName" - so the
    // failure must be visible somewhere in the rendered page, not merely in
    // the store's fieldErrors() signal.
    expect(harness.routeNativeElement!.textContent).toContain('must not be blank');
  }));

  it('does not fetch the salary history until the timeline tab is opened', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    mock.expectNone('/api/employees/7/salary-history');
  }));

  function findButton(harness: RouterTestingHarness, label: string): HTMLButtonElement {
    const button = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      candidate => candidate.textContent?.includes(label),
    );
    if (!button) {
      throw new Error(`No button found with label "${label}"`);
    }
    return button as HTMLButtonElement;
  }

  /**
   * These three tests need a stubbed MatDialog, which the shared beforeEach
   * above does not provide. TestBed.overrideProvider() cannot be used here -
   * the shared beforeEach already called TestBed.inject(HttpTestingController),
   * which instantiates the module - so the module is rebuilt from scratch
   * with the stub included from the start.
   */
  function configureWithStubbedDialog(): { open: jest.Mock; afterClosed$: Subject<boolean | undefined> } {
    const afterClosed$ = new Subject<boolean | undefined>();
    const open = jest.fn().mockReturnValue({ afterClosed: () => afterClosed$ });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter(
          [
            { path: 'employees/:id', component: EmployeeDetailComponent },
            { path: 'employees', component: EmployeesListStubComponent },
          ],
          withComponentInputBinding(),
        ),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    mock = TestBed.inject(HttpTestingController);

    return { open, afterClosed$ };
  }

  it('opens the raise dialog from the pay card with data mapped from the record', fakeAsync(async () => {
    const { open } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Record a raise').click();
    harness.detectChanges();

    expect(open).toHaveBeenCalledTimes(1);
    const config = open.mock.calls[0][1];
    expect(config.data).toEqual({
      employeeId: 7, currency: 'INR', salaryVersion: 0, currentEffectiveFrom: '2024-03-01',
    });
  }));

  it('reloads the record when the raise dialog closes with true', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Record a raise').click();
    harness.detectChanges();

    afterClosed$.next(true);
    tick();

    // load() re-issues a fresh request for the same id - expectOne itself
    // fails if the reload never happened.
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();
  }));

  it('does not reload when the raise dialog is cancelled', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Record a raise').click();
    harness.detectChanges();

    afterClosed$.next(undefined);
    tick();

    mock.expectNone('/api/employees/7');
  }));

  it('does not deactivate when the confirmation is cancelled', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Deactivate').click();
    harness.detectChanges();

    afterClosed$.next(undefined);
    tick();

    // Proves cancelling suppresses the call - the sibling test below proves
    // confirming actually issues it, so this cannot pass merely because the
    // component never calls deactivate at all.
    mock.expectNone('/api/employees/7/deactivate');
  }));

  it('deactivates with an empty body once the confirmation is accepted', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Deactivate').click();
    harness.detectChanges();

    afterClosed$.next(true);
    tick();

    const request = mock.expectOne('/api/employees/7/deactivate');
    // Deactivation is a transition to a fixed target state, not a
    // read-modify-write - no version token to guard a lost update with.
    expect(request.request.body).toEqual({});
    request.flush({ ...DETAIL, status: 'INACTIVE', employeeVersion: 1 });
    harness.detectChanges();
  }));

  it('does not delete when the confirmation is cancelled', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Delete').click();
    harness.detectChanges();

    afterClosed$.next(undefined);
    tick();

    // Sibling test below proves confirming does issue the DELETE, so this
    // cannot pass merely because the component never wires up delete at all.
    mock.expectNone(request => request.method === 'DELETE');
  }));

  it('deletes and returns to the employee list once the confirmation is accepted', fakeAsync(async () => {
    const { afterClosed$ } = configureWithStubbedDialog();
    const router = TestBed.inject(Router);

    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Delete').click();
    harness.detectChanges();

    afterClosed$.next(true);
    tick();

    const request = mock.expectOne(req => req.method === 'DELETE' && req.url === '/api/employees/7');
    request.flush(null);
    tick();

    // Staying on the detail page of a record that no longer appears anywhere
    // is disorienting - the whole point of navigating away on success.
    expect(router.url).toBe('/employees');
  }));

  it('names the employee in the deactivate confirmation instead of asking generically', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Deactivate').click();
    harness.detectChanges();
    tick();

    const dialogText = document.querySelector('mat-dialog-content')!.textContent;
    expect(dialogText).toContain('Asha Menon');

    TestBed.inject(MatDialog).closeAll();
    tick();
  }));

  it('names the employee in the delete confirmation instead of asking generically', fakeAsync(async () => {
    const harness = await RouterTestingHarness.create('/employees/7');
    mock.expectOne('/api/employees/7').flush(DETAIL);
    harness.detectChanges();

    findButton(harness, 'Delete').click();
    harness.detectChanges();
    tick();

    const dialogText = document.querySelector('mat-dialog-content')!.textContent;
    expect(dialogText).toContain('Asha Menon');

    TestBed.inject(MatDialog).closeAll();
    tick();
  }));
});
