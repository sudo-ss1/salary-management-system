import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarChartModule } from '@swimlane/ngx-charts';
import { formatMoney } from '../core/money';
import { groupLabel } from '../shared/group-label';
import { DistributionGroup } from './analytics.models';

export interface ChartPoint {
  readonly name: string;
  readonly value: number;
}

/**
 * Consumes the server's p50 directly. No statistics happen here - ADR-0006.
 *
 * A bar's length must be a number, so value is Number(amount). That number
 * drives pixels only: every figure the reader sees is formatted from the
 * original string by formatValue.
 */
@Component({
  selector: 'app-median-pay-chart',
  standalone: true,
  imports: [BarChartModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Median pay by group</h2>
    <p class="note">In USD, so groups in different currencies are comparable.</p>
    <ngx-charts-bar-horizontal
      [results]="series()"
      [xAxis]="true"
      [yAxis]="true"
      [xAxisTickFormatting]="formatValue"
      [roundDomains]="true"
      [view]="[720, 360]" />
  `,
  styles: [`:host { display: block; } .note { opacity: .7; font-size: .85rem; }`],
})
export class MedianPayChartComponent {
  readonly groups = input.required<ReadonlyArray<DistributionGroup>>();

  readonly series = computed<ChartPoint[]>(() =>
    this.groups()
      .filter(group => !!group.p50)
      .map(group => ({ name: groupLabel(group.key), value: Number(group.p50!.amount) })),
  );

  /** Bound as a method reference, so it must not depend on `this`. */
  readonly formatValue = (value: number): string =>
    formatMoney({ amount: String(value), currency: 'USD' });
}
