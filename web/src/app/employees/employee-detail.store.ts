import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { ApiError } from '../core/problem-detail';
import { NotificationService } from '../core/notification.service';
import { RequestState, failed, loading, ready } from '../shared/request-state';
import { EmployeeApiService } from './employee-api.service';
import { EmployeeDetail, UpdateEmployeeBody } from './employee.models';

/** Fields employee-detail.component.ts renders a <mat-error> for, next to the control itself. */
const RENDERED_FIELDS = new Set(['fullName', 'email']);

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

  /**
   * The component reuses this store across employees (that's why the
   * id-effect exists at all), so load() cannot be a plain .subscribe() - a
   * slow response for an abandoned employee could otherwise resolve after a
   * newer one and repaint the wrong record. switchMap is the same race
   * EmployeeListStore closes for its query; a Subject (rather than a signal)
   * is used here because it emits on every next() regardless of value
   * equality, so reloading the same id - the retry button, and the refill
   * after a save - still issues a fresh request instead of being ignored as
   * a no-op change.
   */
  private readonly loadRequests = new Subject<number>();

  /**
   * The id load() was last called with. A write captures the id it was
   * issued for and, on completion, applies its result only if this still
   * matches - the same reuse-across-employees problem load() has, but with a
   * different fix. A write must NOT be cancelled on navigation: the server
   * has already applied it by the time any response arrives, and cancelling
   * would leave the user unsure whether their change was saved. What must be
   * stopped is a late result repainting a different employee's page, so the
   * request is left to complete and only the resulting state update, saving
   * flag, notification and field errors are conditional on it.
   */
  private activeId: number | null = null;

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(id =>
          this.api.get(id).pipe(
            map(detail => ready<EmployeeDetail>(detail)),
            catchError((error: ApiError) => of(failed<EmployeeDetail>(error))),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(state => this.state.set(state));
  }

  load(id: number): void {
    this.activeId = id;
    this.state.set(loading());
    this.saving.set(false);
    this.conflict.set(false);
    this.fieldErrors.set({});
    this.loadRequests.next(id);
  }

  save(id: number, body: UpdateEmployeeBody): void {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.api.update(id, body).subscribe({
      next: detail => {
        if (this.activeId !== id) {
          return; // navigated away - the write landed, but not on this page
        }
        // Adopt the returned version, or the next save would be stale.
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Changes saved');
      },
      error: (error: ApiError) => this.onWriteFailed(id, error),
    });
  }

  deactivate(id: number): void {
    this.saving.set(true);
    this.api.deactivate(id).subscribe({
      next: detail => {
        if (this.activeId !== id) {
          return;
        }
        this.state.set(ready(detail));
        this.saving.set(false);
        this.notifications.notify('Employee deactivated');
      },
      error: (error: ApiError) => this.onWriteFailed(id, error),
    });
  }

  private onWriteFailed(id: number, error: ApiError): void {
    if (this.activeId !== id) {
      // A validation error, conflict or notification for an employee that is
      // no longer on screen must not surface on whoever is now being viewed.
      return;
    }
    this.saving.set(false);
    this.fieldErrors.set(error.fieldErrors);
    // Only a stale-version 409 gets the reload banner. A uniqueness 409 (e.g.
    // a duplicate email) is not a lost update - it needs its message shown by
    // NotificationService, not a "this record changed, reload" prompt that
    // would not even be true.
    this.conflict.set(error.isVersionConflict);
    this.notifications.notifyError(error, RENDERED_FIELDS);
  }
}
