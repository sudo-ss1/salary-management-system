import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmployeeApiService } from './employee-api.service';
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

describe('EmployeeApiService.create', () => {
  let service: EmployeeApiService;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmployeeApiService);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('posts the full body, with the salary amount left as a string', () => {
    service.create(BODY).subscribe();

    const request = mock.expectOne('/api/employees');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(BODY);
    // Never a number: BODY.salary.amount above is a string literal, and this
    // proves the request carries that same string through unchanged rather
    // than something that merely looks equal after JS coerces it back.
    expect(typeof request.request.body.salary.amount).toBe('string');

    request.flush(null, {
      status: 201, statusText: 'Created', headers: { Location: '/api/employees/42' },
    });
  });

  it('resolves the id the server assigned by reading the Location header', () => {
    let resolvedId: number | undefined;
    service.create(BODY).subscribe(id => (resolvedId = id));

    mock.expectOne('/api/employees').flush(null, {
      status: 201, statusText: 'Created', headers: { Location: '/api/employees/42' },
    });

    // The response body is empty (ResponseEntity<Void>) - the id can only have
    // come from parsing the Location header, never from a body that isn't there.
    expect(resolvedId).toBe(42);
  });
});
