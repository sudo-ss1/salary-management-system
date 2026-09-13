import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `EmployeeListComponent`,
})
export class EmployeeListComponent {}
