import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BarChartModule, Color, ScaleType } from '@swimlane/ngx-charts';
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
    <div class="chart-frame">
      <ngx-charts-bar-vertical
        [results]="series()"
        [xAxis]="true"
        [yAxis]="true"
        [scheme]="colourScheme"
        [roundDomains]="true"
        (select)="onSelect($event)" />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .note { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); margin-bottom: var(--space-3); }

    // No fixed [view]: ngx-charts measures this frame's box and redraws on
    // resize, so the chart fits its card at any viewport width instead of
    // forcing a 720px-wide scrollbar onto the page.
    .chart-frame { width: 100%; height: 320px; }
  `],
})
export class CompaRatioHistogramComponent {
  readonly buckets = input.required<ReadonlyArray<CompaRatioBucket>>();
  readonly bucketSelected = output<CompaRatioBucketKey>();

  // Read from the resolved theme rather than hard-coded, so this stays in
  // step with the palette (and any future dark mode) automatically. ngx-charts
  // applies these as inline SVG fill styles, which resolve CSS custom
  // properties from the document just like any other inline style.
  readonly outOfBandColour = 'var(--mat-sys-error)';
  readonly inBandColour = 'var(--mat-sys-primary)';

  readonly colourScheme: Color = {
    name: 'compa-ratio',
    selectable: false,
    group: ScaleType.Ordinal,
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
