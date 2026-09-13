import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Placeholder for Task 7. Renders nothing; exists only so the detail screen's
 * "Salary history" tab compiles and mounts without making a request until
 * Task 7 replaces this with the real timeline.
 */
@Component({
  selector: 'app-salary-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class SalaryHistoryComponent {
  readonly employeeId = input.required<number>();
}
