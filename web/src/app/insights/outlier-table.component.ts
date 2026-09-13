import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { titleCase } from '../shared/reference';
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
        emptyMessage="Everyone with a pay band is inside it." />

      @if (rows().length > 0) {
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let row">
              <a [routerLink]="['/employees', row.employeeId]">{{ row.fullName }}</a>
              <span class="muted">{{ row.employeeNumber }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Role</th>
            <td mat-cell *matCellDef="let row">
              {{ label(row.role) }}<span class="muted">{{ label(row.level) }} · {{ row.countryCode }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="salary">
            <th mat-header-cell *matHeaderCellDef>Salary</th>
            <td mat-cell *matCellDef="let row">{{ row.salary | money }}</td>
          </ng-container>
          <ng-container matColumnDef="bandMid">
            <th mat-header-cell *matHeaderCellDef>Band midpoint</th>
            <td mat-cell *matCellDef="let row">{{ row.bandMid | money }}</td>
          </ng-container>
          <ng-container matColumnDef="compaRatio">
            <th mat-header-cell *matHeaderCellDef>Compa-ratio</th>
            <td mat-cell *matCellDef="let row"><strong>{{ row.compaRatio }}</strong></td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>

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
    :host { display: block; margin-top: 2rem; }
    table { width: 100%; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
    .note { opacity: .75; max-width: 48rem; }
  `],
})
export class OutlierTableComponent {
  readonly selectedBucket = input<CompaRatioBucketKey | null>(null);

  protected readonly store = inject(InsightsStore);
  protected readonly columns = ['name', 'role', 'salary', 'bandMid', 'compaRatio'];
  protected readonly label = titleCase;

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
