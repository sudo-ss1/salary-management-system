import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { CreateEmployeeStore } from './create-employee.store';
import { CreateEmployeeBody } from './employee.models';

const BODY: CreateEmployeeBody = {
  employeeNumber: 'E-3001',
  fullName: 'Priya Nair',
  email: 'priya@acme.test',
  department: 'ENGINEERING',
  countryCode: 'IN',
  role: 'SOFTWARE_ENGINEER',
  level: 'SENIOR',
  employmentType: 'FULL_TIME',
  hireDate: '2024-03-01',
  salary: { amount: '3500000.00', currency: 'INR' },
  salaryEffectiveFrom: '2024-03-01',
};

describe('CreateEmployeeStore', () => {
  let store: CreateEmployeeStore;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CreateEmployeeStore,
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        // notifyError opens a MatSnackBar; Material throws on a synthetic
        // property without this.
        provideNoopAnimations(),
      ],
    });
    store = TestBed.inject(CreateEmployeeStore);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('hands the id parsed from the Location header to the caller on success', () => {
    const onCreated = jest.fn();

    store.create(BODY, onCreated);
    mock.expectOne('/api/employees').flush(null, {
      status: 201, statusText: 'Created', headers: { Location: '/api/employees/42' },
    });

    expect(onCreated).toHaveBeenCalledWith(42);
    expect(store.saving()).toBe(false);
  });

  it('does not call onCreated when the request fails', () => {
    const onCreated = jest.fn();

    store.create(BODY, onCreated);
    mock.expectOne('/api/employees').flush(
      { title: 'Rule violation', detail: 'Salary must be strictly positive' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(onCreated).not.toHaveBeenCalled();
    expect(store.saving()).toBe(false);
  });

  it('binds a 400 field error to its field name so the form can highlight the control', () => {
    store.create(BODY, jest.fn());
    mock.expectOne('/api/employees').flush(
      {
        title: 'Validation failed', detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(store.fieldErrors()['email']).toBe('must be a well-formed email address');
  });

  it('shows a duplicate email 409 on the page itself, not merely in store state', fakeAsync(() => {
    store.create(BODY, jest.fn());
    mock.expectOne('/api/employees').flush(
      {
        title: 'Conflict', detail: 'That email address is already in use',
        conflictKind: 'UNIQUE_CONSTRAINT',
      },
      { status: 409, statusText: 'Conflict' },
    );
    tick();

    // A store-state assertion (e.g. on fieldErrors) would pass even if nothing
    // ever reached the screen - this is the regression the Critical defect
    // slipped through under, so the check is against what a user would see.
    expect(document.body.textContent).toContain('That email address is already in use');
  }));

  it('surfaces a field error nothing in the form renders, instead of letting it vanish', fakeAsync(() => {
    // salary.currency is derived from the chosen country and has no input of
    // its own - if the server ever objects to it, nothing on the page shows a
    // mat-error for it, so it must still reach the user some other way.
    store.create(BODY, jest.fn());
    mock.expectOne('/api/employees').flush(
      {
        title: 'Validation failed', detail: 'One or more fields are invalid',
        errors: [{ field: 'salary.currency', message: 'must be a well-formed currency' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    tick();

    expect(document.body.textContent).toContain('must be a well-formed currency');
  }));
});
