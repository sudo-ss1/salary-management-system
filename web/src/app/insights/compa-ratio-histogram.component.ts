import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BarChartModule } from '@swimlane/ngx-charts';
import { CompaRatioBucket, CompaRatioBucketKey } from './analytics.models';
import { ChartPoint } from './median-pay-chart.component';

const BANDS: ReadonlyArray<{ key: CompaRatioBucketKey; label: string; problem: boolean }> = [
  { key: 'LT_80', label: 'Under 80%', problem: true },
  { key: 'B80_90', label: '80-90%', problem: false },
  { key: 'B90_110', label: '90-110%', problem: false },
  { key: 'B110_120', label: '110-120%', problem: false },
  { key: 'GT_120', label: 'Over 120%', problem: true },
];

/**
 * A histogram, not a box plot: it reads as "how many people are where" with no
 * training, and the two edge bars are themselves the answer to "is anyone badly
 * out of band?" Counts come from a SQL aggregate.
 */
@Component({
  selector: 'app-compa-ratio-histogram',
  standalone: true,
  imports: [BarChartModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>How many people sit where against their band</h2>
    <p class="note">Click a bar to see those employees.</p>
    <ngx-charts-bar-vertical
      [results]="series()"
      [xAxis]="true"
      [yAxis]="true"
      [scheme]="colourScheme"
      [roundDomains]="true"
      [view]="[720, 360]"
      (select)="onSelect($event)" />
  `,
  styles: [`:host { display: block; } .note { opacity: .7; font-size: .85rem; }`],
})
export class CompaRatioHistogramComponent {
  readonly buckets = input.required<ReadonlyArray<CompaRatioBucket>>();
  readonly bucketSelected = output<CompaRatioBucketKey>();

  readonly outOfBandColour = '#b3261e';
  readonly inBandColour = '#3f51b5';

  readonly colourScheme = {
    name: 'compa-ratio',
    selectable: false,
    group: 'Ordinal',
    domain: BANDS.map(band => (band.problem ? this.outOfBandColour : this.inBandColour)),
  };

  readonly series = computed<ChartPoint[]>(() => {
    const counts = new Map(this.buckets().map(b => [b.bucket, b.headcount]));
    // Driven by BANDS, not by the response order, so the bars are always in
    // ascending order and a missing bucket shows as zero rather than vanishing.
    return BANDS.map(band => ({ name: band.label, value: counts.get(band.key) ?? 0 }));
  });

  onSelect(point: { name: string; value?: number }): void {
    const band = BANDS.find(b => b.label === point.name);
    if (band) {
      this.bucketSelected.emit(band.key);
    }
  }
}
