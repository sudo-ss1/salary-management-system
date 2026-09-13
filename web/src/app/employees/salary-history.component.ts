import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MoneyPipe } from '../core/money.pipe';
import { ApiError } from '../core/problem-detail';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { StatePanelComponent } from '../shared/state-panel.component';
import { EmployeeApiService } from './employee-api.service';
import { SalaryHistoryItem } from './employee.models';

/**
 * Rendered inside an ngTemplateOutlet on the timeline tab, so this component -
 * and its request - only exist once the tab is opened.
 */
@Component({
  selector: 'app-salary-history',
  standalone: true,
  imports: [MatTableModule, MoneyPipe, StatePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-state-panel
      [state]="state()"
      [isEmpty]="rows().length === 0"
      emptyMessage="No previous salaries. This is the first one on record."
      (retry)="load()" />

    @if (rows().length > 0) {
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="period">
          <th mat-header-cell *matHeaderCellDef>Period</th>
          <td mat-cell *matCellDef="let row">{{ row.effectiveFrom }} to {{ row.effectiveTo }}</td>
        </ng-container>
        <ng-container matColumnDef="salary">
          <th mat-header-cell *matHeaderCellDef>Salary</th>
          <td mat-cell *matCellDef="let row">
            {{ row.salary | money }}<span class="muted">{{ row.salaryBaseUsd | money }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="reason">
          <th mat-header-cell *matHeaderCellDef>Reason</th>
          <td mat-cell *matCellDef="let row">{{ row.changeReason || '—' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    }
  `,
  styles: [`
    table { width: 100%; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
  `],
})
export class SalaryHistoryComponent {
  readonly employeeId = input.required<number>();

  private readonly api = inject(EmployeeApiService);
  protected readonly state = signal<RequestState<SalaryHistoryItem[]>>(loading());
  protected readonly columns = ['period', 'salary', 'reason'];

  constructor() {
    effect(() => {
      this.employeeId();
      this.load();
    });
  }

  protected load(): void {
    this.state.set(loading());
    this.api.salaryHistory(this.employeeId()).subscribe({
      next: rows => this.state.set(ready(rows)),
      error: (error: ApiError) => this.state.set(failed(error)),
    });
  }

  protected rows(): SalaryHistoryItem[] {
    const state = this.state();
    return state.status === 'ready' ? state.data : [];
  }
}
