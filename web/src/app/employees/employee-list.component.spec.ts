import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Location } from '@angular/common';
import { apiErrorInterceptor } from '../core/api-error.interceptor';
import { EmployeeListComponent } from './employee-list.component';
import { EmployeeListStore } from './employee-list.store';
import { EmployeePage } from './employee.models';

const PAGE: EmployeePage = {
  content: [
    {
      id: 1, employeeNumber: 'E-001', fullName: 'Asha Menon', email: 'asha@acme.test',
      department: 'ENGINEERING', countryCode: 'IN', role: 'SOFTWARE_ENGINEER', level: 'SENIOR',
      status: 'ACTIVE', salary: { amount: '3712500.00', currency: 'INR' },
      salaryBaseUsd: { amount: '44550.00', currency: 'USD' }, compaRatio: '1.0000',
    },
    {
      id: 2, employeeNumber: 'E-002', fullName: 'Ben Carter', email: 'ben@acme.test',
      department: 'ENGINEERING', countryCode: 'GB', role: 'SOFTWARE_ENGINEER', level: 'MID',
      status: 'ACTIVE', salary: { amount: '100000.00', currency: 'GBP' },
      salaryBaseUsd: { amount: '127000.00', currency: 'USD' }, compaRatio: '0.7000',
    },
  ],
  page: 0, size: 25, totalElements: 42, totalPages: 2,
};

describe('EmployeeListComponent', () => {
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([{ path: 'employees', component: EmployeeListComponent }]),
      ],
    });
    mock = TestBed.inject(HttpTestingController);
  });

  async function open(url = '/employees') {
    const harness = await RouterTestingHarness.create(url);
    return harness;
  }

  it('shows each salary in its own currency alongside the USD equivalent', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    const text = harness.routeNativeElement!.textContent!;
    expect(text).toContain('Asha Menon');
    expect(text).toContain('₹');          // original currency
    expect(text).toContain('$44,550.00'); // USD equivalent, side by side
  }));

  it('flags an employee outside the band so the row is scannable', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    const outOfBand = harness.routeNativeElement!.querySelectorAll('.compa-ratio.out-of-band');
    expect(outOfBand.length).toBe(1); // Ben at 0.70, not Asha at 1.00
  }));

  it('reports the server-side total rather than the number of rows on screen', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    expect(harness.routeNativeElement!.querySelector('mat-paginator')!.textContent)
      .toContain('42');
  }));

  it('restores filters from the url so a filtered view can be shared', fakeAsync(async () => {
    await open('/employees?country=IN&level=SENIOR&sort=SALARY&direction=desc');
    tick(300);

    const request = mock.expectOne(r => r.url === '/api/employees');
    expect(request.request.params.get('country')).toBe('IN');
    expect(request.request.params.get('level')).toBe('SENIOR');
    expect(request.request.params.get('sort')).toBe('SALARY');
    expect(request.request.params.get('direction')).toBe('desc');
    request.flush(PAGE);
  }));

  it('writes filters back to the url so refresh and the back button behave', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);

    TestBed.inject(EmployeeListStore).setFilter('country', 'IN');
    tick(300);
    mock.match(r => r.url === '/api/employees').forEach(r => r.flush(PAGE));
    harness.detectChanges();
    tick();

    expect(TestBed.inject(Location).path()).toContain('country=IN');
  }));

  it('says no employees matched rather than showing an empty table', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees')
      .flush({ ...PAGE, content: [], totalElements: 0, totalPages: 0 });
    harness.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('No employees match these filters');
  }));

  it('says the server is unreachable when the request never landed', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').error(new ProgressEvent('network error'));
    harness.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('reach the server');
  }));

  afterEach(() => mock.verify());
});
