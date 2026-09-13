import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
    <h1>Pay insights</h1>

    <app-filter-bar [value]="store.filters()" (changed)="onFilterChange($event)" />

    <app-state-panel [state]="store.summary()" (retry)="store.reload()" />
    @if (summaryData(); as summary) {
      <app-summary-tiles [summary]="summary" />
      <app-compa-ratio-histogram
        [buckets]="summary.compaRatioBuckets"
        (bucketSelected)="onBucketSelected($event)" />
    }

    <mat-form-field appearance="outline" class="group-by">
      <mat-label>Group by (up to two)</mat-label>
      <mat-select multiple [value]="store.groupBy()" (valueChange)="onGroupBy($event)">
        @for (dimension of dimensions; track dimension) {
          <mat-option [value]="dimension"
                      [disabled]="isDimensionDisabled(dimension)">{{ label(dimension) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <app-state-panel
      [state]="store.distribution()"
      [isEmpty]="groups().length === 0"
      emptyMessage="No employees match these filters, so there is nothing to compare."
      (retry)="store.reload()" />

    @if (groups().length > 0) {
      <app-median-pay-chart [groups]="groups()" />

      <table mat-table [dataSource]="groups()">
        <ng-container matColumnDef="group">
          <th mat-header-cell *matHeaderCellDef>Group</th>
          <td mat-cell *matCellDef="let row">{{ groupLabel(row) }}</td>
        </ng-container>
        <ng-container matColumnDef="headcount">
          <th mat-header-cell *matHeaderCellDef>People</th>
          <td mat-cell *matCellDef="let row">{{ row.headcount }}</td>
        </ng-container>
        @for (percentile of percentiles; track percentile) {
          <ng-container [matColumnDef]="percentile">
            <th mat-header-cell *matHeaderCellDef>{{ percentile }}</th>
            <td mat-cell *matCellDef="let row">{{ row[percentile] | money }}</td>
          </ng-container>
        }
        <ng-container matColumnDef="medianCompaRatio">
          <th mat-header-cell *matHeaderCellDef>Median compa-ratio</th>
          <td mat-cell *matCellDef="let row">{{ row.medianCompaRatio ?? '—' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
      <p class="note">
        Percentiles are in USD and answer what a group costs. Median compa-ratio compares each
        salary against its own country's band, so it is the figure to use when comparing countries.
      </p>
    }

    <app-outlier-table [selectedBucket]="selectedBucket()" />
  `,
  styles: [`
    .group-by { min-width: 20rem; margin-top: 1.5rem; }
    table { width: 100%; margin-top: 1rem; }
    .note { opacity: .7; font-size: .85rem; max-width: 60rem; }
  `],
})
export class InsightsComponent {
  protected readonly store = inject(InsightsStore);
  protected readonly dimensions: GroupByDimension[] = ['COUNTRY', 'DEPARTMENT', 'ROLE', 'LEVEL'];
  protected readonly percentiles = ['p25', 'p50', 'p75', 'p90', 'mean'];
  protected readonly columns =
    ['group', 'headcount', 'p25', 'p50', 'p75', 'p90', 'mean', 'medianCompaRatio'];
  protected readonly label = titleCase;
  protected readonly selectedBucket = signal<CompaRatioBucketKey | null>(null);

  protected summaryData() {
    const state = this.store.summary();
    return state.status === 'ready' ? state.data : null;
  }

  protected groups() {
    const state = this.store.distribution();
    return state.status === 'ready' ? state.data : [];
  }

  protected groupLabel(group: { key: Record<string, string> }): string {
    const parts = Object.values(group.key);
    return parts.length > 0 ? parts.join(' · ') : 'Whole organization';
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
