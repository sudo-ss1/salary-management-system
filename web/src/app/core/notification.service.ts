import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from './problem-detail';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }

  /**
   * Field-level errors are only ever safe to hide here if the caller can
   * name a control that renders each one - so the caller must declare that
   * set explicitly via `renderedFields` rather than this service assuming a
   * form exists to catch them. Any field error whose name is not in that set
   * is "unclaimed": it goes to the snackbar instead, so a server-side field
   * nothing renders yet can never fail silently - it is merely reported
   * twice on the day someone finally adds the control for it.
   *
   * A stale-version conflict is never announced here either - it needs a
   * reload prompt, not a transient toast. A uniqueness conflict (e.g. a
   * duplicate email) has no reload prompt to show instead, so its message
   * must reach the snackbar like any other error.
   */
  notifyError(error: ApiError, renderedFields: ReadonlySet<string> = new Set()): void {
    if (error.isVersionConflict) {
      return;
    }
    const fieldEntries = Object.entries(error.fieldErrors);
    const unclaimed = fieldEntries.filter(([field]) => !renderedFields.has(field));
    if (fieldEntries.length > 0 && unclaimed.length === 0) {
      return; // every field error has a control rendering it - nothing left to say
    }
    const message = unclaimed.length > 0
      ? unclaimed.map(([, fieldMessage]) => fieldMessage).join(' ')
      : error.detail;
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
