import { Injectable, inject, signal } from '@angular/core';
import { ApiError } from '../core/problem-detail';
import { NotificationService } from '../core/notification.service';
import { EmployeeApiService } from './employee-api.service';
import { CreateEmployeeBody } from './employee.models';

/**
 * Fields create-employee.component.ts renders a <mat-error> for, next to the
 * control itself. Notably absent: "salary.currency" - the currency is
 * derived from the chosen country and has no input of its own, so a server
 * error naming it must still reach NotificationService rather than vanish.
 */
const RENDERED_FIELDS = new Set([
  'employeeNumber', 'fullName', 'email', 'department', 'countryCode', 'role', 'level',
  'employmentType', 'hireDate', 'salary.amount', 'salaryEffectiveFrom',
]);

/**
 * Provided at component level: a fresh create screen should never carry a
 * previous attempt's saving flag or field errors into the next one.
 */
@Injectable()
export class CreateEmployeeStore {
  private readonly api = inject(EmployeeApiService);
  private readonly notifications = inject(NotificationService);

  readonly saving = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});

  /** onCreated receives the id parsed from the server's Location header. */
  create(body: CreateEmployeeBody, onCreated: (id: number) => void): void {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.api.create(body).subscribe({
      next: id => {
        this.saving.set(false);
        onCreated(id);
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.fieldErrors.set(error.fieldErrors);
        this.notifications.notifyError(error, RENDERED_FIELDS);
      },
    });
  }
}
