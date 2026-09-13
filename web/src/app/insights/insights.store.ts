import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../core/problem-detail';
import { failed, loading, ready } from '../shared/request-state';
import { AnalyticsApiService } from './analytics-api.service';
import {
  AnalyticsFilterValues, DistributionGroup, GroupByDimension, OutlierBand, OutlierPage, SummaryResponse,
} from './analytics.models';

export const MAX_GROUP_BY = 2;

@Injectable()
export class InsightsStore {
  private readonly api = inject(AnalyticsApiService);

  readonly country = signal<string | null>(null);
  readonly department = signal<string | null>(null);
  readonly level = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  /** Country first: "what do we pay a senior engineer here versus there" is the question most asked. */
  readonly groupBy = signal<readonly GroupByDimension[]>(['COUNTRY']);
  readonly outlierPage = signal(0);
  readonly outlierSize = signal(25);
  readonly outlierBand = signal<OutlierBand | null>(null);

  readonly filters = computed<AnalyticsFilterValues>(() => ({
    country: this.country(),
    department: this.department(),
    level: this.level(),
    status: this.status(),
  }));

  private readonly distributionParams = computed(() => ({
    filters: this.filters(),
    groupBy: this.groupBy(),
  }));

  private readonly outlierParams = computed(() => ({
    filters: this.filters(),
    page: this.outlierPage(),
    size: this.outlierSize(),
    band: this.outlierBand(),
  }));

  /**
   * A tick that re-issues all three requests with their current parameters,
   * even when nothing has changed - the same Subject shape
   * EmployeeDetailStore uses for its load(), needed for the same reason: a
   * plain signal write is a no-op when the value is unchanged, so a retry
   * click after an unchanged filter selection would otherwise do nothing.
   */
  private readonly reload$ = new Subject<void>();

  // No explicit type argument on toSignal: supplying one (e.g.
  // toSignal<RequestState<SummaryResponse>>(...)) breaks overload resolution
  // against ToSignalOptions.initialValue and fails to compile. Letting
  // inference derive the type from `initialValue` works.
  readonly summary = toSignal(
    merge(toObservable(this.filters), this.reload$.pipe(map(() => this.filters()))).pipe(
      switchMap(filters => track(this.api.summary(filters))),
    ),
    { initialValue: loading<SummaryResponse>() },
  );

  readonly distribution = toSignal(
    merge(
      toObservable(this.distributionParams),
      this.reload$.pipe(map(() => this.distributionParams())),
    ).pipe(
      switchMap(({ filters, groupBy }) => track(this.api.distribution(filters, groupBy))),
    ),
    { initialValue: loading<DistributionGroup[]>() },
  );

  readonly outliers = toSignal(
    merge(
      toObservable(this.outlierParams),
      this.reload$.pipe(map(() => this.outlierParams())),
    ).pipe(switchMap(({ filters, page, size, band }) =>
      track(this.api.outliers(filters, page, size, band)))),
    { initialValue: loading<OutlierPage>() },
  );

  setFilter(key: keyof AnalyticsFilterValues, value: string | null): void {
    this[key].set(value);
    // A narrower filter means a shorter outlier list; page 4 of it may not exist.
    this.outlierPage.set(0);
  }

  setGroupBy(dimensions: readonly GroupByDimension[]): void {
    if (dimensions.length > MAX_GROUP_BY) {
      // Caught here rather than as a 400: the control should not have allowed it.
      throw new Error(`Group by at most two dimensions, was given ${dimensions.length}`);
    }
    this.groupBy.set(dimensions);
  }

  setOutlierPage(page: number): void {
    this.outlierPage.set(page);
  }

  setOutlierSize(size: number): void {
    this.outlierSize.set(size);
    this.outlierPage.set(0);
  }

  setOutlierBand(band: OutlierBand | null): void {
    this.outlierBand.set(band);
    // A narrower band is a shorter list; page 4 of it may not exist.
    this.outlierPage.set(0);
  }

  /** Re-issues all three requests with their current parameters - what every Try again button calls. */
  reload(): void {
    this.reload$.next();
  }
}

/** Wraps a request as loading, then ready or error, without throwing into the signal. */
function track<T>(source: import('rxjs').Observable<T>) {
  return source.pipe(
    map(data => ready(data)),
    catchError((error: ApiError) => of(failed<T>(error))),
    startWith(loading<T>()),
  );
}
