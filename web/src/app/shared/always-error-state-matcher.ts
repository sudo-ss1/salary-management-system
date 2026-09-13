import { ErrorStateMatcher } from '@angular/material/core';

/**
 * Angular Material only renders a projected <mat-error> when the control's
 * own client-side validators report it invalid (via the default
 * ErrorStateMatcher, which checks `control.invalid`). The inputs this is used
 * on carry no client-side validators at all - their only errors are the
 * server's, arriving after a save - so the default matcher would keep every
 * <mat-error> hidden no matter what it contains.
 *
 * This matcher always reports "in error", handing display control entirely
 * to the `@if` around each <mat-error>'s content: it shows exactly when there
 * is a message to show, and nothing when there is not.
 */
export class AlwaysShowErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(): boolean {
    return true;
  }
}
