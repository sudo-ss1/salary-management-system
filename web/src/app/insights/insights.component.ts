import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-insights',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `InsightsComponent`,
})
export class InsightsComponent {}
