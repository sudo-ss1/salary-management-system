import { ChangeDetectionStrategy, Component } from '@angular/core';
import { InfoButtonComponent } from './info-button.component';

/**
 * The single wording of what a compa-ratio is, wherever the figure appears.
 *
 * Kept in one component for the same reason COMPA_RATIO_LOW/HIGH live in one
 * file: two copies of an explanation drift, and an explanation that disagrees
 * with the badge beside it - or with the other screen's - is worse than none.
 * The thresholds quoted here are the ones in compa-ratio-bands.ts.
 */
@Component({
  selector: 'app-compa-ratio-info',
  standalone: true,
  imports: [InfoButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-info-button label="What compa-ratio means">
      <h3 class="info-panel__title">Compa-ratio</h3>
      <p>
        Someone's pay compared with the <strong>midpoint</strong> of their pay band —
        the band set for their role, level and country.
      </p>
      <p>
        <strong>100%</strong> is exactly at the midpoint. Below <strong>80%</strong> or
        above <strong>120%</strong> is flagged as an outlier and worth a look: usually
        underpayment on one side, and someone near the ceiling for their level on the
        other.
      </p>
      <p>
        Both figures are in the same local currency, so no exchange rate is involved.
        That is what makes it comparable across countries — 90% means the same thing in
        Bengaluru as it does in London.
      </p>
    </app-info-button>
  `,
})
export class CompaRatioInfoComponent {}
