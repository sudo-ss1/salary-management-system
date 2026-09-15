import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { FilterBarComponent, FilterChange } from '../employees/filter-bar.component';
import { InsightsStore } from './insights.store';
import { SummaryTilesComponent } from './summary-tiles.component';
import { MedianPayChartComponent } from './median-pay-chart.component';
import { CompaRatioHistogramComponent } from './compa-ratio-histogram.component';
import { OutlierTableComponent } from './outlier-table.component';
import { CompaRatioBucketKey, GroupByDimension } from './analytics.models';
import { titleCase } from '../shared/reference';
import { groupLabel } from '../shared/group-label';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    MatFormFieldModule, MatSelectModule, MatTableModule, MoneyPipe, StatePanelComponent,
    FilterBarComponent, SummaryTilesComponent, MedianPayChartComponent,
    CompaRatioHistogramComponent, OutlierTableComponent,
  ],
  providers: [InsightsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header__text">
        <h1>Pay insights</h1>
        <span class="page-header__context">How the organisation pays people, by group and by band</span>
      </div>
    </div>

    <div class="control-strip">
      <app-filter-bar [value]="store.filters()" (changed)="onFilterChange($event)" />
    </div>

    <app-state-panel [state]="store.summary()" (retry)="store.reload()" />
    @if (summaryData(); as summary) {
      <app-summary-tiles [summary]="summary" />

      <section class="surface-card chart-card">
        <app-compa-ratio-histogram
          [buckets]="summary.compaRatioBuckets"
          (bucketSelected)="onBucketSelected($event)" />
      </section>
    }

    <section class="section">
      <div class="section__header">
        <h2>Compare groups</h2>
        <mat-form-field appearance="outline" class="group-by">
          <mat-label>Group by (up to two)</mat-label>
          <mat-select multiple [value]="store.groupBy()" (valueChange)="onGroupBy($event)">
            @for (dimension of dimensions; track dimension) {
              <mat-option [value]="dimension"
                          [disabled]="isDimensionDisabled(dimension)">{{ label(dimension) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <app-state-panel
        [state]="store.distribution()"
        [isEmpty]="groups().length === 0"
        emptyMessage="No employees match these filters, so there is nothing to compare."
        (retry)="store.reload()" />

      @if (groups().length > 0) {
        <section class="surface-card chart-card">
          <app-median-pay-chart [groups]="groups()" />
        </section>

        <div class="surface-card table-card">
          <div class="table-scroll">
            <table mat-table [dataSource]="groups()">
              <ng-container matColumnDef="group">
                <th mat-header-cell *matHeaderCellDef>Group</th>
                <td mat-cell *matCellDef="let row">{{ groupLabel(row) }}</td>
              </ng-container>
              <ng-container matColumnDef="headcount">
                <th mat-header-cell *matHeaderCellDef class="numeric-col">People</th>
                <td mat-cell *matCellDef="let row" class="numeric numeric-col">{{ row.headcount }}</td>
              </ng-container>
              @for (percentile of percentiles; track percentile) {
                <ng-container [matColumnDef]="percentile">
                  <th mat-header-cell *matHeaderCellDef class="numeric-col">{{ percentileLabels[percentile] }}</th>
                  <td mat-cell *matCellDef="let row" class="numeric numeric-col">{{ row[percentile] | money }}</td>
                </ng-container>
              }
              <ng-container matColumnDef="medianCompaRatio">
                <th mat-header-cell *matHeaderCellDef class="numeric-col">Median compa-ratio</th>
                <td mat-cell *matCellDef="let row" class="numeric numeric-col">{{ row.medianCompaRatio ?? '—' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        </div>
        <p class="note">
          A percentile is the figure that share of the group earns below: the 75th percentile is what
          three-quarters of them earn less than. <strong>Median</strong> is the middle salary, and a
          better guide than <strong>Average</strong>, which a handful of large salaries can pull
          upward. All figures are in USD. <strong>Median compa-ratio</strong> compares each salary
          against its own country's band rather than converting it, so it is the figure to use when
          comparing countries.
        </p>
      }
    </section>

    <app-outlier-table [selectedBucket]="selectedBucket()" />
  `,
  styles: [`
    .section { margin-top: var(--space-6); }

    .section__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .group-by { width: 20rem; margin: 0; }

    .chart-card { margin-bottom: var(--space-5); }

    .table-card { padding: 0; overflow: hidden; }
    .table-scroll { max-height: 70vh; overflow: auto; }
    table { width: 100%; }

    th.mat-mdc-header-cell {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface-variant);
    }

    tr.mat-mdc-row:hover { background: var(--mat-sys-surface-container); }
    tr.mat-mdc-row td { border-bottom-color: var(--mat-sys-outline-variant); }

    .numeric-col { text-align: right; }

    .note { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); max-width: 60rem; margin-top: var(--space-3); }
  `],
})
export class InsightsComponent {
  protected readonly store = inject(InsightsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly dimensions: GroupByDimension[] = ['COUNTRY', 'DEPARTMENT', 'ROLE', 'LEVEL'];
  protected readonly percentiles = ['p25', 'p50', 'p75', 'p90', 'mean'];

  // The column keys index into the row; these are what the reader sees. "p50"
  // is jargon for the persona requirements.md describes, and "Median" is the
  // word they already use for the same thing.
  protected readonly percentileLabels: Record<string, string> = {
    p25: '25th percentile',
    p50: 'Median',
    p75: '75th percentile',
    p90: '90th percentile',
    mean: 'Average',
  };
  protected readonly columns =
    ['group', 'headcount', 'p25', 'p50', 'p75', 'p90', 'mean', 'medianCompaRatio'];
  protected readonly label = titleCase;
  protected readonly selectedBucket = signal<CompaRatioBucketKey | null>(null);

  constructor() {
    // Read once on entry so a shared or bookmarked URL restores its view
    // before anything else runs - same ordering EmployeeListComponent
    // relies on and for the same reason: take(1) resolves synchronously
    // here, so the restore lands before the effect below's first
    // (asynchronous) run and cannot be stripped by it, and the effect's own
    // navigation has nobody left listening to feed back into the store.
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      this.store.applyQueryParams(params);
      // selectedBucket lives on the component, not the store, so it is
      // derived from the restored band rather than kept in two places that
      // could disagree.
      this.selectedBucket.set(this.store.outlierBand());
    });

    // ...then keep the URL in step, replacing rather than pushing so the
    // back button leaves the screen instead of walking through every change.
    effect(() => {
      const queryParams = this.store.toQueryParams();
      void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
    });
  }

  protected summaryData() {
    const state = this.store.summary();
    return state.status === 'ready' ? state.data : null;
  }

  protected groups() {
    const state = this.store.distribution();
    return state.status === 'ready' ? state.data : [];
  }

  protected groupLabel(group: { key: Readonly<Record<string, string>> }): string {
    return groupLabel(group.key);
  }

  /** Disables the unselected options once two are chosen, so the cap cannot be exceeded. */
  protected isDimensionDisabled(dimension: GroupByDimension): boolean {
    const selected = this.store.groupBy();
    return selected.length >= 2 && !selected.includes(dimension);
  }

  protected onGroupBy(dimensions: GroupByDimension[]): void {
    this.store.setGroupBy(dimensions);
  }

  protected onFilterChange(change: FilterChange): void {
    this.store.setFilter(change.key, change.value);
  }

  protected onBucketSelected(bucket: CompaRatioBucketKey): void {
    // Selecting the already-selected bar again is the only way back to the
    // combined list - otherwise it stays a one-way door once any bar is clicked.
    this.selectedBucket.update(current => (current === bucket ? null : bucket));
  }
}
