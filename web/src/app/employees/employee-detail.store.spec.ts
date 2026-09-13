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
      {
        title: 'Conflict', detail: 'This record changed since you loaded it.',
        currentVersion: 3, conflictKind: 'STALE_VERSION',
      },
      { status: 409, statusText: 'Conflict' },
    );

    // Silently retrying with the fresh version would re-create the lost update
    // the version exists to prevent.
    expect(store.conflict()).toBe(true);
    expect(store.saving()).toBe(false);
    mock.expectNone(r => r.method === 'PUT');
  });

  it('does not raise the reload banner for a uniqueness conflict', () => {
    store.load(7);
    mock.expectOne('/api/employees/7').flush(DETAIL);

    store.save(7, EDIT);
    mock.expectOne(r => r.method === 'PUT').flush(
      {
        title: 'Conflict', detail: 'That email address is already in use',
        conflictKind: 'UNIQUE_CONSTRAINT',
      },
      { status: 409, statusText: 'Conflict' },
    );

    // A duplicate email is a 409, but it is not a stale version: the reload
    // banner would be both wrong (nothing about this record changed) and
    // useless (reloading would not free up the email address). The message
    // itself is the notification service's job to surface, not this store's.
    expect(store.conflict()).toBe(false);
    expect(store.saving()).toBe(false);
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
    // Load-bearing: proves the conflict was actually set, not merely absent
    // by coincidence, before the reload is asked to clear it.
    expect(store.conflict()).toBe(true);

    store.load(7);
    mock.expectOne('/api/employees/7').flush({ ...DETAIL, employeeVersion: 3 });

    expect(store.conflict()).toBe(false);
    // load() also clears conflict synchronously, before any response arrives -
    // so the assertion above alone would hold even if this flush were deleted.
    // Pinning the resulting data to the flushed version proves the reload
    // itself, not just the synchronous reset, is what the store ends up with.
    const state = store.state();
    expect(state.status === 'ready' && state.data.employeeVersion).toBe(3);
  });

  it('does not let a slow response for an abandoned employee overwrite a newer one', () => {
    store.load(7);
    const first = mock.expectOne('/api/employees/7');

    // Navigating on to employee 8 before 7 answers - the component reuses
    // this store instance across employees, so without cancellation a late
    // response for 7 could resolve after 8's and repaint the wrong record.
    store.load(8);
    const second = mock.expectOne('/api/employees/8');

    // The superseded request must be cancelled, not merely ignored: an
    // ignored-but-still-in-flight request is still a request left running.
    expect(first.cancelled).toBe(true);

    second.flush({ ...DETAIL, id: 8, employeeNumber: 'E-008', fullName: 'Ben Ortiz' });

    const state = store.state();
    expect(state.status === 'ready' && state.data.id).toBe(8);
    expect(state.status === 'ready' && state.data.fullName).toBe('Ben Ortiz');
  });

  it('issues a fresh request when the same employee is loaded again', () => {
    // The retry button and the post-save reload both call load() with the id
    // already on screen - cancellation must not be mistaken for de-duplication.
    store.load(7);
    store.load(7);

    const requests = mock.match('/api/employees/7');
    expect(requests.length).toBe(2);
    expect(requests[0].cancelled).toBe(true);

    requests[1].flush(DETAIL);
    const state = store.state();
    expect(state.status).toBe('ready');
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
