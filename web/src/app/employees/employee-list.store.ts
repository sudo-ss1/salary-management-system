import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../core/problem-detail';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { EmployeeApiService } from './employee-api.service';
import { EmployeePage, EmployeeQuery, EmployeeSort, FilterKey, SortDirection } from './employee.models';

const DEBOUNCE_MS = 300;

@Injectable({ providedIn: 'root' })
export class EmployeeListStore {
  private readonly api = inject(EmployeeApiService);

  readonly search = signal('');
  readonly country = signal<string | null>(null);
  readonly department = signal<string | null>(null);
  readonly level = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly page = signal(0);
  readonly size = signal(25);
  readonly sort = signal<EmployeeSort>('FULL_NAME');
  readonly direction = signal<SortDirection>('asc');

  /** Only the search box is debounced. A filter chip or page click is deliberate and immediate. */
  private readonly settledSearch = toSignal(
    toObservable(this.search).pipe(debounceTime(DEBOUNCE_MS), distinctUntilChanged()),
    { initialValue: '' },
  );

  readonly query = computed<EmployeeQuery>(() => ({
    country: this.country(),
    department: this.department(),
    level: this.level(),
    status: this.status(),
    q: this.settledSearch(),
    page: this.page(),
    size: this.size(),
    sort: this.sort(),
    direction: this.direction(),
  }));

  /**
   * switchMap is the frontend's race condition, closed. Without it a slow
   * response for an abandoned query can resolve last and repaint the table.
   */
  readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap(query =>
        this.api.list(query).pipe(
          map(page => ready(page)),
          catchError((error: ApiError) => of(failed<EmployeePage>(error))),
          startWith(loading<EmployeePage>()),
        ),
      ),
    ),
    { initialValue: loading<EmployeePage>() },
  );

  readonly totalElements = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data.totalElements : 0;
  });

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(0);
  }

  setFilter(key: FilterKey, value: string | null): void {
    this[key].set(value);
    // Narrowing the result set while on page 5 would show an empty table.
    this.page.set(0);
  }

  setSort(sort: EmployeeSort, direction: SortDirection): void {
    this.sort.set(sort);
    this.direction.set(direction);
    this.page.set(0);
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setSize(size: number): void {
    this.size.set(size);
    this.page.set(0);
  }

  /** Only non-default values, so a clean list has a clean URL. */
  toQueryParams(): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    if (this.country()) params['country'] = this.country()!;
    if (this.department()) params['department'] = this.department()!;
    if (this.level()) params['level'] = this.level()!;
    if (this.status()) params['status'] = this.status()!;
    if (this.search().trim()) params['q'] = this.search().trim();
    if (this.sort() !== 'FULL_NAME') params['sort'] = this.sort();
    if (this.direction() !== 'asc') params['direction'] = this.direction();
    if (this.page() !== 0) params['page'] = this.page();
    return params;
  }

  applyQueryParams(params: Record<string, unknown>): void {
    this.country.set((params['country'] as string) ?? null);
    this.department.set((params['department'] as string) ?? null);
    this.level.set((params['level'] as string) ?? null);
    this.status.set((params['status'] as string) ?? null);
    this.search.set((params['q'] as string) ?? '');
    this.sort.set((params['sort'] as EmployeeSort) ?? 'FULL_NAME');
    this.direction.set((params['direction'] as SortDirection) ?? 'asc');
    this.page.set(Number(params['page'] ?? 0));
  }
}
