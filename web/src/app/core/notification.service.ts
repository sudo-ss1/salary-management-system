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
   * Field-level errors are bound to form controls by the caller, so only the
   * rest reach the snackbar. A 409 is never announced here - it needs a reload
   * prompt, not a transient toast.
   */
  notifyError(error: ApiError): void {
    if (Object.keys(error.fieldErrors).length > 0 || error.isConflict) {
      return;
    }
    this.snackBar.open(error.detail, 'Dismiss', { duration: 6000 });
  }
}
