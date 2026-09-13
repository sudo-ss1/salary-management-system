import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `EmployeeDetailComponent`,
})
export class EmployeeDetailComponent {}
