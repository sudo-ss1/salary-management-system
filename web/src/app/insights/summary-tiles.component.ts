import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MoneyPipe } from '../core/money.pipe';
import { SummaryResponse } from './analytics.models';

@Component({
  selector: 'app-summary-tiles',
  standalone: true,
  imports: [MatCardModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tiles">
      <mat-card>
        <span class="label">Headcount</span>
        <span class="figure">{{ summary().headcount }}</span>
      </mat-card>
      <mat-card>
        <span class="label">Total cost to company</span>
        <span class="figure">{{ summary().totalCostToCompanyUsd | money }}</span>
        <span class="note">USD, converted at the rate recorded on each salary</span>
      </mat-card>
      <mat-card>
        <span class="label">Mean salary</span>
        <span class="figure">{{ summary().meanBaseUsd | money }}</span>
        <span class="note">USD</span>
      </mat-card>
      @if (summary().unbandedCount > 0) {
        <mat-card>
          <span class="label">Without a pay band</span>
          <span class="figure">{{ summary().unbandedCount }}</span>
          <span class="note">
            These employees have no pay band for their role, level and country. They count towards
            headcount and payroll, but have no compa-ratio.
          </span>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
    mat-card { padding: 1.25rem; display: flex; flex-direction: column; gap: .25rem; }
    .label { font-size: .85rem; opacity: .7; }
    .figure { font-size: 1.9rem; font-variant-numeric: tabular-nums; }
    .note { font-size: .75rem; opacity: .6; }
  `],
})
export class SummaryTilesComponent {
  readonly summary = input.required<SummaryResponse>();
}
