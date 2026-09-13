import { Injectable, inject, signal } from '@angular/core';
import { ApiError } from '../core/problem-detail';
import { NotificationService } from '../core/notification.service';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { EmployeeApiService } from './employee-api.service';
import { EmployeeDetail, UpdateEmployeeBody } from './employee.models';

/**
 * Provided at component level, not root, so navigating between employees starts
 * clean rather than briefly showing the previous person's record.
 */
@Injectable()
export class EmployeeDetailStore {
  private readonly api = inject(EmployeeApiService);
  private readonly notifications = inject(NotificationService);

  readonly state = signal<RequestState<EmployeeDetail>>(loading());
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});

  load(id: number): void {
    this.state.set(loading());
    this.conflict.set(false);
    this.fieldErrors.set({});
    this.api.get(id).subscribe({
      next: detail => this.state.set(ready(detail)),
      error: (error: ApiError) => this.state.set(failed(error)),
    });
  }

  save(id: number, body: UpdateEmployeeBody): void {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.api.update(id, body).subscribe({
      next: detail => {
        // Adopt the returned version, or the next save would be stale.
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Changes saved');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  deactivate(id: number): void {
    this.saving.set(true);
    this.api.deactivate(id).subscribe({
      next: detail => {
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Employee deactivated');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  remove(id: number): void {
    this.saving.set(true);
    this.api.remove(id).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.notify('Employee deleted');
      },
      error: (error: ApiError) => this.onWriteFailed(error),
    });
  }

  private onWriteFailed(error: ApiError): void {
    this.saving.set(false);
    this.fieldErrors.set(error.fieldErrors);
    // Only a stale-version 409 gets the reload banner. A uniqueness 409 (e.g.
    // a duplicate email) is not a lost update - it needs its message shown by
    // NotificationService, not a "this record changed, reload" prompt that
    // would not even be true.
    this.conflict.set(error.isVersionConflict);
    this.notifications.notifyError(error);
  }
}
