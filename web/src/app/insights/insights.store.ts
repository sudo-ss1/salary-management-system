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

/** Country first: "what do we pay a senior engineer here versus there" is the question most asked. */
const DEFAULT_GROUP_BY: readonly GroupByDimension[] = ['COUNTRY'];
const GROUP_BY_DIMENSIONS: readonly GroupByDimension[] = ['DEPARTMENT', 'COUNTRY', 'ROLE', 'LEVEL'];
/** Only the two edge bands are valid outlier bands; the rest are within band by definition. */
const OUTLIER_BANDS: readonly OutlierBand[] = ['LT_80', 'GT_120'];

@Injectable()
export class InsightsStore {
  private readonly api = inject(AnalyticsApiService);

  readonly country = signal<string | null>(null);
  readonly department = signal<string | null>(null);
  readonly level = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly groupBy = signal<readonly GroupByDimension[]>(DEFAULT_GROUP_BY);
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
    // Re-affirming the band already in effect changes nothing about the
    // result set, so the page must be left alone - OutlierTableComponent
    // re-asserts whatever selectedBucket it was given the moment it mounts
    // (including one just restored from the URL), and that must not silently
    // undo an outlierPage that came in on the same URL.
    if (band === this.outlierBand()) {
      return;
    }
    this.outlierBand.set(band);
    // A narrower band is a shorter list; page 4 of it may not exist.
    this.outlierPage.set(0);
  }

  /** Re-issues all three requests with their current parameters - what every Try again button calls. */
  reload(): void {
    this.reload$.next();
  }

  /** Only non-default values, so a clean view has a clean URL. */
  toQueryParams(): Record<string, string | number | string[]> {
    const params: Record<string, string | number | string[]> = {};
    if (this.country()) params['country'] = this.country()!;
    if (this.department()) params['department'] = this.department()!;
    if (this.level()) params['level'] = this.level()!;
    if (this.status()) params['status'] = this.status()!;
    if (!isDefaultGroupBy(this.groupBy())) params['groupBy'] = [...this.groupBy()];
    if (this.outlierBand()) params['outlierBand'] = this.outlierBand()!;
    if (this.outlierPage() !== 0) params['outlierPage'] = this.outlierPage();
    return params;
  }

  /**
   * Restores state from a bookmarked or shared URL. Signals are set
   * directly here rather than through setFilter/setGroupBy/setOutlierBand -
   * those setters reset outlierPage as a side effect of a live filter
   * change, which would otherwise clobber a restored outlierPage before it
   * takes hold. Every value is guarded: a hand-edited or stale URL must
   * never reach the server carrying an enum it will reject, or a group-by
   * longer than the control itself allows.
   */
  applyQueryParams(params: Record<string, unknown>): void {
    this.country.set((params['country'] as string) ?? null);
    this.department.set((params['department'] as string) ?? null);
    this.level.set((params['level'] as string) ?? null);
    this.status.set((params['status'] as string) ?? null);
    this.groupBy.set(toGroupBy(params['groupBy']));
    this.outlierBand.set(toOutlierBand(params['outlierBand']));
    this.outlierPage.set(toPageNumber(params['outlierPage']));
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

function isDefaultGroupBy(dimensions: readonly GroupByDimension[]): boolean {
  return dimensions.length === DEFAULT_GROUP_BY.length
    && dimensions.every((dimension, index) => dimension === DEFAULT_GROUP_BY[index]);
}

/**
 * A hand-edited URL can name a dimension the control does not offer, or ask
 * for more dimensions than the control's own two-dimension cap - the same
 * cap setGroupBy() enforces by throwing, which is right for a control that
 * should never have allowed it but wrong for a URL a person can type
 * anything into. Unknown dimensions are dropped rather than forwarded (the
 * backend would 400 on one it does not recognise, and the user has no way
 * to act on that); what's left is capped, not thrown on; and an empty or
 * fully-invalid result falls back to the same default the store starts with.
 */
function toGroupBy(value: unknown): readonly GroupByDimension[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const valid = raw.filter((entry): entry is GroupByDimension =>
    GROUP_BY_DIMENSIONS.includes(entry as GroupByDimension));
  const deduped = [...new Set(valid)].slice(0, MAX_GROUP_BY);
  return deduped.length > 0 ? deduped : DEFAULT_GROUP_BY;
}

/**
 * B90_110 (etc.) is a real compa-ratio bucket key, just not one the outliers
 * endpoint accepts as a band - forwarding it would be a 400 the user cannot
 * act on, so anything outside the two valid bands falls back to no filter.
 */
function toOutlierBand(value: unknown): OutlierBand | null {
  return OUTLIER_BANDS.includes(value as OutlierBand) ? (value as OutlierBand) : null;
}

/**
 * A hand-edited or stale bookmarked URL is exactly what applyQueryParams
 * exists to survive: ?outlierPage=banana must not become NaN and get sent
 * to the server as the literal string "NaN", and ?outlierPage=-1 is equally
 * not a page. (Mirrors employee-list.store.ts's toPageNumber.)
 */
function toPageNumber(value: unknown): number {
  const page = Number(value ?? 0);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}
