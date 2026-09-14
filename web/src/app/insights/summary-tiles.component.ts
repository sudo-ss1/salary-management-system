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
        <span class="figure">{{ summary().headcount.toLocaleString() }}</span>
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
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }

    mat-card {
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      background: var(--mat-sys-surface);
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: none;
    }

    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    // The figure is the hero of the tile - the largest, boldest thing on it.
    .figure {
      font-size: 2rem;
      font-weight: 500;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum' 1;
      color: var(--mat-sys-on-surface);
    }

    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      opacity: .85;
    }
  `],
})
export class SummaryTilesComponent {
  readonly summary = input.required<SummaryResponse>();
}
