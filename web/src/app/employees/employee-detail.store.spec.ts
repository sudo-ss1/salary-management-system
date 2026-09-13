import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeDetailStore } from './employee-detail.store';
import { EmployeeDetail, UpdateEmployeeBody } from './employee.models';

const DETAIL: EmployeeDetail = {
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

const EDIT: UpdateEmployeeBody = {
  fullName: 'Asha Menon-Rao', email: 'asha@acme.test', department: 'ENGINEERING',
  role: 'SOFTWARE_ENGINEER', level: 'STAFF', employmentType: 'FULL_TIME', employeeVersion: 0,
};

describe('EmployeeDetailStore', () => {
  let store: EmployeeDetailStore;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmployeeDetailStore,
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        // Success paths call NotificationService.notify, which opens a
        // MatSnackBar; Material throws on a synthetic property without this.
        provideNoopAnimations(),
      ],
    });
    store = TestBed.inject(EmployeeDetailStore);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('loads the record and exposes both version tokens', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    const state = store.state();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && state.data.employeeVersion).toBe(0);
    expect(state.status === 'ready' && state.data.salaryVersion).toBe(0);
  });

  it('sends the employee version when saving, never the salary version', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    const request = mock.expectOne(r => r.method === 'PUT');
    expect(request.request.body.employeeVersion).toBe(0);
    expect(request.request.body.salaryVersion).toBeUndefined();
    request.flush({ ...DETAIL, fullName: 'Asha Menon-Rao', level: 'STAFF', employeeVersion: 1 });
  });

  it('adopts the version the server returns so the next save is not stale', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush({ ...DETAIL, employeeVersion: 1 });

    const state = store.state();
    expect(state.status === 'ready' && state.data.employeeVersion).toBe(1);
  });

  it('raises a conflict rather than retrying when the record changed underneath', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );

    // Silently retrying with the fresh version would re-create the lost update
    // the version exists to prevent.
    expect(store.conflict()).toBe(true);
    expect(store.saving()).toBe(false);
    mock.expectNone(r => r.method === 'PUT');
  });

  it('surfaces field errors so the form can highlight the offending input', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, { ...EDIT, email: 'not-an-email' });
    mock.expectOne(r => r.method === 'PUT').flush(
      {
        title: 'Validation failed', detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(store.fieldErrors()['email']).toBe('must be a well-formed email address');
    expect(store.conflict()).toBe(false);
  });

  it('clears a previous conflict when the record is reloaded', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);
    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush({}, { status: 409, statusText: 'Conflict' });
    expect(store.conflict()).toBe(true);

    store.load(7);
    mock.expectOne('/api/employees/7').flush({ ...DETAIL, employeeVersion: 3 });

    expect(store.conflict()).toBe(false);
  });

  it('reports a missing employee as not found rather than an empty record', () => {
    store.load(999);
    mock.expectOne('/api/employees/999').flush(
      { title: 'Not found', detail: 'No employee with id 999' },
      { status: 404, statusText: 'Not Found' },
    );

    const state = store.state();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error.status).toBe(404);
  });

  it('deactivates without sending any version token', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.deactivate(7);
    const request = mock.expectOne('/api/employees/7/deactivate');
    // Deactivation is a transition to a fixed target state, not a
    // read-modify-write, so there is no lost update to guard against.
    expect(request.request.body).toEqual({});
    request.flush({ ...DETAIL, status: 'INACTIVE', employeeVersion: 1 });

    const state = store.state();
    expect(state.status === 'ready' && state.data.status).toBe('INACTIVE');
  });
});
