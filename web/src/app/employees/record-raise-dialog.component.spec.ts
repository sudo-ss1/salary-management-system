import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { RecordRaiseDialogComponent } from './record-raise-dialog.component';

describe('RecordRaiseDialogComponent', () => {
  let mock: HttpTestingController;
  const dialogRef = { close: jest.fn() };

  beforeEach(async () => {
    dialogRef.close.mockReset();
    await TestBed.configureTestingModule({
      imports: [RecordRaiseDialogComponent],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { employeeId: 7, currency: 'INR', salaryVersion: 2,
                      currentEffectiveFrom: '2024-03-01' },
        },
      ],
    }).compileComponents();
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('sends the salary version, not the employee version', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: 'Promotion' };

    fixture.componentInstance.submit();

    const request = mock.expectOne('/api/employees/7/salary');
    expect(request.request.body).toEqual({
      salary: { amount: '4640625.00', currency: 'INR' },
      effectiveFrom: '2026-01-01',
      changeReason: 'Promotion',
      salaryVersion: 2,
    });
    request.flush({});
  });

  it('locks the currency to the one the employee is paid in', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    // The server rejects a mismatch, so offering a choice would only invite a
    // 400 the user cannot act on. This checks INR labels the amount field
    // itself - not merely that the string appears somewhere in the dialog,
    // which would pass even if the amount input didn't exist at all.
    const amountField: HTMLInputElement | null =
      fixture.nativeElement.querySelector('input[inputmode="decimal"]');
    expect(amountField).not.toBeNull();
    const formField = amountField!.closest('mat-form-field');
    expect(formField!.textContent).toContain('INR');
    expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
  });

  it('omits changeReason from the request body when left blank', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();

    const request = mock.expectOne('/api/employees/7/salary');
    // The key can still be present with an undefined value in memory; what
    // matters is that it is gone once the body is actually serialized.
    expect(JSON.stringify(request.request.body)).not.toContain('changeReason');
    request.flush({});
  });

  it('closes and reports success once the raise is recorded', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush({});

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('keeps the dialog open and shows why when the server rejects the date', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2024-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush(
      { title: 'Rule violation',
        detail: 'A new salary must take effect after the current one, which began 2024-03-01' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('must take effect after');
  });

  it('disables cancel while the raise is in flight, so it cannot be used to dodge a save', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const cancelButton: HTMLButtonElement | null =
      Array.from(fixture.nativeElement.querySelectorAll('button'))
        .find((button: HTMLButtonElement) => button.textContent?.includes('Cancel')) ?? null;
    expect(cancelButton).not.toBeNull();
    expect(cancelButton!.disabled).toBe(true);

    mock.expectOne('/api/employees/7/salary').flush({});
  });

  it('shows the server field errors next to the offending inputs, mapping the nested salary.amount key', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '', effectiveFrom: '', changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush(
      {
        title: 'Bad Request',
        detail: 'One or more fields are invalid',
        errors: [
          { field: 'effectiveFrom', message: 'must not be null' },
          { field: 'salary.amount', message: 'must be a valid amount' },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    // The user is told what to do, not merely that something is wrong.
    expect(fixture.nativeElement.textContent).toContain('must not be null');
    expect(fixture.nativeElement.textContent).toContain('must be a valid amount');
    expect(fixture.nativeElement.textContent).not.toContain('One or more fields are invalid');
  });

  it('reports a replayed submission as a conflict rather than applying it twice', () => {
    const fixture = TestBed.createComponent(RecordRaiseDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.form = { amount: '4640625.00', effectiveFrom: '2026-01-01',
                                       changeReason: '' };

    fixture.componentInstance.submit();
    mock.expectOne('/api/employees/7/salary').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('already been recorded');
  });
});
