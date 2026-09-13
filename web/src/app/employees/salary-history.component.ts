import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
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

  /**
   * EmployeeDetailComponent reuses this component's host across employees
   * (its own id-effect is proof the instance survives a route-id change), so
   * a plain .subscribe() per id could let a slow response for an abandoned
   * employee land after a newer one and repaint history under the wrong
   * name. switchMap cancels the superseded request instead of merely
   * ignoring its response - the same race EmployeeDetailStore.load() closes.
   * A Subject (rather than deriving straight from the employeeId signal) is
   * used because it emits on every next() regardless of value equality, so
   * the retry button reloading the same id still issues a fresh request.
   */
  private readonly loadRequests = new Subject<number>();

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(id =>
          this.api.salaryHistory(id).pipe(
            map(rows => ready<SalaryHistoryItem[]>(rows)),
            catchError((error: ApiError) => of(failed<SalaryHistoryItem[]>(error))),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(state => this.state.set(state));

    effect(() => {
      this.load(this.employeeId());
    });
  }

  protected load(id: number = this.employeeId()): void {
    this.state.set(loading());
    this.loadRequests.next(id);
  }

  protected rows(): SalaryHistoryItem[] {
    const state = this.state();
    return state.status === 'ready' ? state.data : [];
  }
}
