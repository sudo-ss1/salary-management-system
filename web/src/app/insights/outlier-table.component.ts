import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { titleCase } from '../shared/reference';
import { compaRatioPercent } from '../shared/compa-ratio-bands';
import { InsightsStore } from './insights.store';
import { CompaRatioBucketKey, OutlierBand } from './analytics.models';

/** Only the two edge bands are outlier bands; the rest are within band by definition. */
const OUTLIER_BANDS: ReadonlyArray<CompaRatioBucketKey> = ['LT_80', 'GT_120'];

@Component({
  selector: 'app-outlier-table',
  standalone: true,
  imports: [MatTableModule, MatPaginatorModule, RouterLink, MoneyPipe, StatePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Employees outside their band</h2>

    @if (isInBandSelection()) {
      <p class="note">
        Those employees are within band, so there is nothing to review here. Select the
        under-80% or over-120% bar to see people who need attention.
      </p>
    } @else {
      <app-state-panel
        [state]="store.outliers()"
        [isEmpty]="rows().length === 0"
        emptyMessage="Everyone with a pay band is inside it."
        (retry)="store.reload()" />

      @if (rows().length > 0) {
        <div class="surface-card table-card">
          <div class="table-scroll">
            <table mat-table [dataSource]="rows()">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let row">
                  <a class="cell-primary" [routerLink]="['/employees', row.employeeId]">{{ row.fullName }}</a>
                  <span class="cell-secondary">{{ row.employeeNumber }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="role">
                <th mat-header-cell *matHeaderCellDef>Role</th>
                <td mat-cell *matCellDef="let row">
                  <span class="cell-primary">{{ label(row.role) }}</span>
                  <span class="cell-secondary">{{ label(row.level) }} · {{ row.countryCode }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="salary">
                <th mat-header-cell *matHeaderCellDef class="numeric-col">Salary</th>
                <td mat-cell *matCellDef="let row" class="numeric numeric-col">{{ row.salary | money }}</td>
              </ng-container>
              <ng-container matColumnDef="bandMid">
                <th mat-header-cell *matHeaderCellDef class="numeric-col">Band midpoint</th>
                <td mat-cell *matCellDef="let row" class="numeric numeric-col">{{ row.bandMid | money }}</td>
              </ng-container>
              <ng-container matColumnDef="compaRatio">
                <th mat-header-cell *matHeaderCellDef class="numeric-col">Compa-ratio</th>
                <td mat-cell *matCellDef="let row" class="numeric-col">
                  <span class="compa-ratio out-of-band numeric">{{ compaPercent(row.compaRatio) }}</span>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        </div>

        <mat-paginator
          [length]="total()"
          [pageIndex]="store.outlierPage()"
          [pageSize]="store.outlierSize()"
          [pageSizeOptions]="[10, 25, 50, 100]"
          (page)="onPage($event)" />
      }
    }
  `,
  styles: [`
    :host { display: block; margin-top: var(--space-7); }

    h2 { margin-bottom: var(--space-4); }

    .table-card { padding: 0; overflow: hidden; margin-bottom: var(--space-4); }
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

    .compa-ratio {
      display: inline-flex;
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      font-weight: 600;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .note { color: var(--mat-sys-on-surface-variant); max-width: 48rem; }
  `],
})
export class OutlierTableComponent {
  readonly selectedBucket = input<CompaRatioBucketKey | null>(null);

  protected readonly store = inject(InsightsStore);
  protected readonly columns = ['name', 'role', 'salary', 'bandMid', 'compaRatio'];
  protected readonly label = titleCase;
  protected readonly compaPercent = compaRatioPercent;

  protected readonly isInBandSelection = computed(() => {
    const bucket = this.selectedBucket();
    return bucket !== null && !OUTLIER_BANDS.includes(bucket);
  });

  constructor() {
    effect(() => {
      const bucket = this.selectedBucket();
      // An in-band selection asks for no request at all; the message explains why.
      if (!this.isInBandSelection()) {
        this.store.setOutlierBand(bucket as OutlierBand | null);
      }
    });
  }

  protected rows() {
    const state = this.store.outliers();
    return state.status === 'ready' ? state.data.content : [];
  }

  protected total(): number {
    const state = this.store.outliers();
    return state.status === 'ready' ? state.data.totalElements : 0;
  }

  protected onPage(event: PageEvent): void {
    if (event.pageSize !== this.store.outlierSize()) {
      this.store.setOutlierSize(event.pageSize);
    } else {
      this.store.setOutlierPage(event.pageIndex);
    }
  }
}
