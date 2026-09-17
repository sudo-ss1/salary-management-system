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

  /** The table row whose cells contain the given employee's name. */
  function rowFor(harness: RouterTestingHarness, name: string): HTMLElement {
    const rows = Array.from(harness.routeNativeElement!.querySelectorAll('tr'));
    const row = rows.find(tr => tr.textContent?.includes(name));
    if (!row) {
      throw new Error(`no row found for "${name}"`);
    }
    return row as HTMLElement;
  }

  it('shows each salary in its own currency alongside the USD equivalent', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    // Scoped to Asha's own row, not the page as a whole - a bug that renders
    // one row's USD figure into another's would still leave both substrings
    // present somewhere on the page, but not paired in the same row.
    const ashaRow = rowFor(harness, 'Asha Menon');
    expect(ashaRow.textContent).toContain('₹');          // original currency
    expect(ashaRow.textContent).toContain('$44,550.00'); // USD equivalent, side by side
  }));

  it('flags an employee outside the band so the row is scannable', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    // Identity, not just count: a bug that flagged "the second row" by
    // position rather than reading each row's own compaRatio would also
    // produce exactly one flagged element and pass a count-only assertion.
    const benRow = rowFor(harness, 'Ben Carter');
    const ashaRow = rowFor(harness, 'Asha Menon');
    expect(benRow.querySelectorAll('.compa-ratio.out-of-band').length).toBe(1); // Ben at 0.70
    expect(ashaRow.querySelectorAll('.compa-ratio.out-of-band').length).toBe(0); // Asha at 1.00
  }));

  it('explains compa-ratio from the column header, where most readers meet the term first', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    expect(document.body.textContent).not.toContain('is exactly at the midpoint');

    const info = harness.routeNativeElement!
      .querySelector<HTMLButtonElement>('th app-compa-ratio-info button')!;
    expect(info.getAttribute('aria-label')).toBe('What compa-ratio means');
    info.click();
    harness.detectChanges();

    // Same wording as the employee record, because it is the same component -
    // two copies of this explanation would drift apart.
    expect(document.body.textContent).toContain('100%');
    expect(document.body.textContent).toContain('80%');
    expect(document.body.textContent).toContain('120%');
  }));

  it('centres the compa-ratio column so its header and its chips share one axis', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    // The values are chips, not digits: there is no decimal edge to share, so
    // a right-aligned header carrying a control could never agree with them.
    // Header and cells must carry the same centring class, or the column
    // disagrees with itself again.
    const header = harness.routeNativeElement!.querySelector('th.compa-col');
    const cell = harness.routeNativeElement!.querySelector('td.compa-col');
    expect(header).not.toBeNull();
    expect(cell).not.toBeNull();
    expect(header!.querySelector('app-compa-ratio-info')).not.toBeNull();
    // The money column stays right-aligned - centring is for this column only.
    expect(harness.routeNativeElement!.querySelector('th.numeric-col')).not.toBeNull();
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

  it('offers a way to add an employee - otherwise the feature has no entry point', fakeAsync(async () => {
    const harness = await open();
    tick(300);
    mock.expectOne(r => r.url === '/api/employees').flush(PAGE);
    harness.detectChanges();

    const link: HTMLAnchorElement | null =
      harness.routeNativeElement!.querySelector('a[href="/employees/new"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('Add employee');
  }));

  afterEach(() => mock.verify());
});
