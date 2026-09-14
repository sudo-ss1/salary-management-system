import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { AlwaysShowErrorStateMatcher } from '../shared/always-error-state-matcher';
import { isOutOfBand } from '../shared/compa-ratio-bands';
import { ConfirmDialogComponent, ConfirmDialogData } from '../shared/confirm-dialog.component';
import { DEPARTMENTS, EMPLOYMENT_TYPES, LEVELS, ROLES, titleCase } from '../shared/reference';
import { SalaryHistoryComponent } from './salary-history.component';
import { RecordRaiseDialogComponent } from './record-raise-dialog.component';
import { EmployeeDetailStore } from './employee-detail.store';
import { EmployeeDetail } from './employee.models';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatTabsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MoneyPipe, StatePanelComponent, SalaryHistoryComponent,
  ],
  providers: [EmployeeDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="back-link" routerLink="/employees">Back to employees</a>

    <app-state-panel [state]="store.state()" (retry)="store.load(+id())" />

    @if (employee(); as person) {
      <div class="page-header">
        <div class="page-header__text">
          <h1>{{ person.fullName }}</h1>
          <span class="page-header__context">{{ person.employeeNumber }} · {{ label(person.status) }}</span>
        </div>
      </div>

      <!-- Identity: read-only facts about the record, not editable fields. -->
      <dl class="facts surface-card">
        <div><dt>Employee number</dt><dd>{{ person.employeeNumber }}</dd></div>
        <div><dt>Hire date</dt><dd>{{ person.hireDate }}</dd></div>
        <div>
          <dt>Status</dt>
          <dd><span class="chip" [attr.data-tone]="person.status === 'ACTIVE' ? 'positive' : null">
            {{ label(person.status) }}
          </span></dd>
        </div>
      </dl>

      @if (store.conflict()) {
        <div class="conflict" role="alert">
          <span>This record changed since you opened it. Reload to see the current values.</span>
          <button mat-stroked-button (click)="store.load(+id())">Reload</button>
        </div>
      }

      <mat-tab-group class="detail-tabs">
        <mat-tab label="Details">
          <!-- Current pay is why this page is open, so it leads - the pay
               figure is the most prominent number on the screen. -->
          <section class="surface-card pay-card">
            <h2>Current pay</h2>
            <div class="pay-figure">
              <span class="pay-figure__primary numeric">{{ person.salary | money }}</span>
              <span class="pay-figure__secondary numeric">{{ person.salaryBaseUsd | money }} at the recorded rate</span>
            </div>

            @if (person.bandMid) {
              <div class="compa-explain">
                <span class="compa-ratio numeric" [class.out-of-band]="isOutOfBand(person.compaRatio ?? '')">
                  {{ person.compaRatio }}
                </span>
                <p>
                  Compared against a band midpoint of <strong>{{ person.bandMid | money }}</strong>
                  (range {{ person.bandMin | money }} to {{ person.bandMax | money }}).
                </p>
              </div>
            } @else {
              <p class="cell-secondary">
                No pay band exists for {{ label(person.role) }} at {{ label(person.level) }} in
                {{ person.countryCode }}, so no compa-ratio can be calculated.
              </p>
            }

            <button mat-stroked-button (click)="openRaiseDialog(person)">Record a raise</button>
          </section>

          <!-- Editable details, grouped by what they describe. -->
          <section class="surface-card details-card">
            <h2>Details</h2>
            <div class="field-group">
              <mat-form-field appearance="outline" class="field-wide">
                <mat-label>Full name</mat-label>
                <input matInput [(ngModel)]="form.fullName" [errorStateMatcher]="alwaysShowErrors" />
                @if (store.fieldErrors()['fullName']; as message) {
                  <mat-error>{{ message }}</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="field-wide">
                <mat-label>Email</mat-label>
                <input matInput [(ngModel)]="form.email" [errorStateMatcher]="alwaysShowErrors" />
                @if (store.fieldErrors()['email']; as message) {
                  <mat-error>{{ message }}</mat-error>
                }
              </mat-form-field>
            </div>

            <div class="field-group">
              <mat-form-field appearance="outline" class="field-medium">
                <mat-label>Department</mat-label>
                <mat-select [(ngModel)]="form.department">
                  @for (option of departments; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="field-medium">
                <mat-label>Role</mat-label>
                <mat-select [(ngModel)]="form.role">
                  @for (option of roles; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="field-narrow">
                <mat-label>Level</mat-label>
                <mat-select [(ngModel)]="form.level">
                  @for (option of levels; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="field-medium">
                <mat-label>Employment type</mat-label>
                <mat-select [(ngModel)]="form.employmentType">
                  @for (option of employmentTypes; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            <!--
              Deactivate is the only record-lifecycle action offered here.
              The API also supports a soft delete, but requirements section 3
              lists "create, read, update, deactivate" - and offering both at
              once asks a non-technical user to choose between "no longer
              employed" and "this record should not exist", a distinction the
              data model needs and they do not.
            -->
            <div class="actions">
              <button mat-flat-button [disabled]="store.saving()" (click)="onSave()">Save</button>
              <span class="actions__spacer"></span>
              <button mat-stroked-button [disabled]="store.saving()"
                      (click)="confirmDeactivate(person)">Deactivate</button>
            </div>
          </section>
        </mat-tab>

        <mat-tab label="Salary history">
          <ng-template matTabContent>
            <div class="surface-card history-card">
              <app-salary-history [employeeId]="+id()" />
            </div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .back-link { display: inline-block; margin-bottom: var(--space-4); }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-6);
      margin: 0 0 var(--space-5);
      padding: var(--space-4) var(--space-5);
    }
    .facts div { display: flex; align-items: center; gap: var(--space-2); }
    .facts dt { color: var(--mat-sys-on-surface-variant); margin: 0; font: var(--mat-sys-label-medium); }
    .facts dd { margin: 0; font-weight: 500; }

    .conflict {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
      padding: var(--space-3) var(--space-4);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-radius: var(--mat-sys-corner-large);
      margin: 0 0 var(--space-5);
    }

    .detail-tabs { display: block; }

    .pay-card, .details-card, .history-card { margin-top: var(--space-5); }

    .pay-card { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }

    .pay-figure { display: flex; flex-direction: column; gap: var(--space-1); }
    .pay-figure__primary { font-size: 2.25rem; font-weight: 500; line-height: 1.2; }
    .pay-figure__secondary { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-medium); }

    .compa-explain { display: flex; align-items: center; gap: var(--space-3); }
    .compa-explain p { margin: 0; color: var(--mat-sys-on-surface-variant); }

    .compa-ratio {
      display: inline-flex;
      flex-shrink: 0;
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font-weight: 600;
    }
    .compa-ratio.out-of-band {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .field-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin-top: var(--space-4);
    }
    .field-group:first-of-type { margin-top: var(--space-3); }
    .field-wide { flex: 1 1 18rem; }
    .field-medium { flex: 1 1 14rem; }
    .field-narrow { flex: 0 1 9rem; }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-5);
    }
    .actions__spacer { flex: 1 1 auto; }
  `],
})
export class EmployeeDetailComponent {
  /** Bound from the route by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly store = inject(EmployeeDetailStore);
  private readonly dialog = inject(MatDialog);
  protected readonly departments = DEPARTMENTS;
  protected readonly roles = ROLES;
  protected readonly levels = LEVELS;
  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly label = titleCase;
  protected readonly isOutOfBand = isOutOfBand;
  protected readonly alwaysShowErrors = new AlwaysShowErrorStateMatcher();

  protected form = {
    fullName: '', email: '', department: '', role: '', level: '', employmentType: '',
  };

  protected readonly employee = computed(() => {
    const state = this.store.state();
    return state.status === 'ready' ? state.data : null;
  });

  constructor() {
    // Load whenever the route id changes.
    effect(() => this.store.load(+this.id()));

    // Refill the form whenever the record is replaced - including after a save,
    // which returns an incremented version.
    effect(() => {
      const person = this.employee();
      if (person) {
        this.form = {
          fullName: person.fullName, email: person.email, department: person.department,
          role: person.role, level: person.level, employmentType: person.employmentType,
        };
      }
    });
  }

  onSave(): void {
    const person = this.employee();
    if (!person) {
      return;
    }
    this.store.save(+this.id(), { ...this.form, employeeVersion: person.employeeVersion });
  }

  protected confirmDeactivate(person: EmployeeDetail): void {
    this.openConfirm({
      title: `Deactivate ${person.fullName}?`,
      message: `${person.fullName} will stay in the system and keep appearing in employee lists - `
        + 'only their employment status will change to inactive.',
      confirmLabel: 'Deactivate',
    }).subscribe(confirmed => {
      if (confirmed) {
        this.store.deactivate(+this.id());
      }
    });
  }

  private openConfirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data }).afterClosed();
  }

  protected openRaiseDialog(person: EmployeeDetail): void {
    const ref = this.dialog.open(RecordRaiseDialogComponent, {
      data: {
        employeeId: person.id,
        currency: person.salary.currency,
        salaryVersion: person.salaryVersion,
        currentEffectiveFrom: person.salaryEffectiveFrom,
      },
    });
    ref.afterClosed().subscribe(result => {
      if (result === true) {
        this.store.load(+this.id());
      }
    });
  }
}
