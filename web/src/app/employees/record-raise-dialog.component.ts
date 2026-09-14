import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { ApiError } from '../core/problem-detail';
import { AlwaysShowErrorStateMatcher } from '../shared/always-error-state-matcher';
import { EmployeeApiService } from './employee-api.service';

export interface RecordRaiseData {
  readonly employeeId: number;
  readonly currency: string;
  readonly salaryVersion: number;
  readonly currentEffectiveFrom: string;
}

/**
 * Fields this dialog renders a <mat-error> for, after mapping the server's
 * nested "salary.amount" onto the dialog's flat "amount". Any fieldErrors key
 * outside this set has nothing to display it inline - see RENDERED_FIELDS's
 * use in submit() below, which is what keeps such a field from vanishing.
 */
const RENDERED_FIELDS = new Set(['amount', 'salary.amount', 'effectiveFrom', 'changeReason']);

@Component({
  selector: 'app-record-raise-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Record a new salary</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline">
        <mat-label>Amount in {{ data.currency }}</mat-label>
        <input matInput inputmode="decimal" [(ngModel)]="form.amount"
               [errorStateMatcher]="alwaysShowErrors" />
        <span matTextSuffix>{{ data.currency }}</span>
        @if (amountError(); as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Effective from</mat-label>
        <input matInput type="date" [(ngModel)]="form.effectiveFrom"
               [errorStateMatcher]="alwaysShowErrors" />
        <mat-hint>Must be after {{ data.currentEffectiveFrom }}</mat-hint>
        @if (effectiveFromError(); as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Reason</mat-label>
        <input matInput [(ngModel)]="form.changeReason" [errorStateMatcher]="alwaysShowErrors" />
        @if (changeReasonError(); as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      @if (message(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving()">Cancel</button>
      <button mat-flat-button [disabled]="saving()" (click)="submit()">Record</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { display: flex; flex-direction: column; gap: var(--space-2); min-width: 24rem; }
    .error {
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);
      border-radius: var(--mat-sys-corner-medium);
      padding: var(--space-2) var(--space-3);
      margin: 0;
    }
  `],
})
export class RecordRaiseDialogComponent {
  protected readonly data = inject<RecordRaiseData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RecordRaiseDialogComponent>);
  private readonly api = inject(EmployeeApiService);

  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly alwaysShowErrors = new AlwaysShowErrorStateMatcher();

  // The server names the amount "salary.amount" (it lives on a nested
  // request object); this dialog's own field is just "amount".
  protected readonly amountError = computed(() =>
    this.fieldErrors()['amount'] ?? this.fieldErrors()['salary.amount']);
  protected readonly effectiveFromError = computed(() => this.fieldErrors()['effectiveFrom']);
  protected readonly changeReasonError = computed(() => this.fieldErrors()['changeReason']);

  form = { amount: '', effectiveFrom: '', changeReason: '' };

  submit(): void {
    this.saving.set(true);
    this.message.set(null);
    this.fieldErrors.set({});

    this.api
      .recordRaise(this.data.employeeId, {
        // Currency is fixed to the employee's own: the server rejects a
        // mismatch, so offering a choice would only invite a 400.
        salary: { amount: this.form.amount, currency: this.data.currency },
        effectiveFrom: this.form.effectiveFrom,
        changeReason: this.form.changeReason || undefined,
        salaryVersion: this.data.salaryVersion,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogRef.close(true);
        },
        error: (error: ApiError) => {
          this.saving.set(false);
          this.fieldErrors.set(error.fieldErrors);
          // A conflict here means the version was already consumed - almost
          // always a double submission (a stale salaryVersion replayed, or a
          // salary_one_per_employee uniqueness violation). Both mean the same
          // thing to the user: say so plainly, and never resend.
          if (error.isConflict) {
            this.message.set(
              'This raise has already been recorded, or someone else changed the salary. Close and reload.',
            );
            return;
          }
          const fieldEntries = Object.entries(error.fieldErrors);
          const unclaimed = fieldEntries.filter(([field]) => !RENDERED_FIELDS.has(field));
          if (fieldEntries.length === 0) {
            this.message.set(error.detail);
          } else if (unclaimed.length > 0) {
            // A field error nothing renders inline must still reach the
            // user - fold it into the same message area rather than let it
            // vanish just because fieldErrors happens to be non-empty.
            this.message.set(unclaimed.map(([, fieldMessage]) => fieldMessage).join(' '));
          } else {
            // Each mat-error above already says what to fix; a generic
            // "one or more fields are invalid" banner on top adds nothing.
            this.message.set(null);
          }
        },
      });
  }
}
