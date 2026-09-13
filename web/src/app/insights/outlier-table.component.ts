import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CompaRatioBucketKey } from './analytics.models';

/**
 * Placeholder for Task 10. Accepts the selected bucket so the insights shell
 * compiles and wires the click-through from the histogram; renders nothing
 * until Task 10 replaces this with the real table.
 */
@Component({
  selector: 'app-outlier-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class OutlierTableComponent {
  readonly selectedBucket = input<CompaRatioBucketKey | null>(null);
}
