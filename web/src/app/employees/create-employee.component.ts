import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { AlwaysShowErrorStateMatcher } from '../shared/always-error-state-matcher';
import { COUNTRIES, DEPARTMENTS, EMPLOYMENT_TYPES, LEVELS, ROLES, currencyForCountry } from '../shared/reference';
import { CreateEmployeeStore } from './create-employee.store';

/**
 * Every field the CreateEmployeeRequest DTO carries: creating an employee
 * always creates their first salary too (there is no meaningful state in
 * which an employee exists with no pay), so this single form captures the
 * whole thing rather than treating pay as a later step.
 */
interface FormState {
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  role: string;
  level: string;
  employmentType: string;
  hireDate: string;
  salaryAmount: string;
  salaryEffectiveFrom: string;
}

const EMPTY_FORM: FormState = {
  employeeNumber: '', fullName: '', email: '', department: '', role: '', level: '',
  employmentType: '', hireDate: '', salaryAmount: '', salaryEffectiveFrom: '',
};

@Component({
  selector: 'app-create-employee',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule,
  ],
  providers: [CreateEmployeeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="back-link" routerLink="/employees">Back to employees</a>

    <div class="page-header">
      <div class="page-header__text">
        <h1>Add employee</h1>
        <span class="page-header__context">Creates the record and their first salary together</span>
      </div>
    </div>

    <section class="surface-card form-card">
      <h2>Identity</h2>
      <div class="field-group">
        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Employee number</mat-label>
          <input matInput [(ngModel)]="form.employeeNumber" [errorStateMatcher]="alwaysShowErrors" />
          @if (store.fieldErrors()['employeeNumber']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-wide">
          <mat-label>Full name</mat-label>
          <input matInput [(ngModel)]="form.fullName" [errorStateMatcher]="alwaysShowErrors" />
          @if (store.fieldErrors()['fullName']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-wide">
          <mat-label>Email</mat-label>
          <input matInput type="email" [(ngModel)]="form.email" [errorStateMatcher]="alwaysShowErrors" />
          @if (store.fieldErrors()['email']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>
      </div>

      <h2>Role</h2>
      <div class="field-group">
        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Department</mat-label>
          <mat-select [(ngModel)]="form.department">
            @for (option of departments; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (store.fieldErrors()['department']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Country</mat-label>
          <mat-select [value]="countryCode()" (selectionChange)="onCountryChange($event.value)">
            @for (option of countries; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (store.fieldErrors()['countryCode']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Role</mat-label>
          <mat-select [(ngModel)]="form.role">
            @for (option of roles; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (store.fieldErrors()['role']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-narrow">
          <mat-label>Level</mat-label>
          <mat-select [(ngModel)]="form.level">
            @for (option of levels; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (store.fieldErrors()['level']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Employment type</mat-label>
          <mat-select [(ngModel)]="form.employmentType">
            @for (option of employmentTypes; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (store.fieldErrors()['employmentType']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-narrow">
          <mat-label>Hire date</mat-label>
          <input matInput type="date" [(ngModel)]="form.hireDate" [errorStateMatcher]="alwaysShowErrors" />
          <mat-hint>Not in the future</mat-hint>
          @if (store.fieldErrors()['hireDate']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>
      </div>

      <h2>Starting pay</h2>
      <div class="field-group">
        <mat-form-field appearance="outline" class="field-medium">
          <mat-label>Starting salary{{ currency() ? ' in ' + currency() : '' }}</mat-label>
          <input matInput inputmode="decimal" [(ngModel)]="form.salaryAmount"
                 [errorStateMatcher]="alwaysShowErrors" />
          @if (currency()) {
            <span matTextSuffix>{{ currency() }}</span>
          }
          @if (store.fieldErrors()['salary.amount']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-narrow">
          <mat-label>Effective from</mat-label>
          <input matInput type="date" [(ngModel)]="form.salaryEffectiveFrom"
                 [errorStateMatcher]="alwaysShowErrors" />
          <mat-hint>On/after hire date</mat-hint>
          @if (store.fieldErrors()['salaryEffectiveFrom']; as message) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>
      </div>

      <div class="actions">
        <button mat-flat-button [disabled]="store.saving() || !countryCode()" (click)="onSubmit()">
          Create employee
        </button>
        <button mat-stroked-button routerLink="/employees" [disabled]="store.saving()">Cancel</button>
      </div>
    </section>
  `,
  styles: [`
    .back-link { display: inline-block; margin-bottom: var(--space-4); }

    .form-card { margin-top: 0; }
    .form-card h2 { font-size: 1rem; color: var(--mat-sys-on-surface-variant); margin-bottom: var(--space-3); }
    .form-card h2:not(:first-child) {
      margin-top: var(--space-5);
      padding-top: var(--space-5);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .field-group { display: flex; flex-wrap: wrap; gap: var(--space-4); }
    .field-wide { flex: 1 1 16rem; }
    .field-medium { flex: 1 1 12rem; }
    .field-narrow { flex: 0 1 9rem; }

    .actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-6);
      padding-top: var(--space-5);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
  `],
})
export class CreateEmployeeComponent {
  protected readonly store = inject(CreateEmployeeStore);
  private readonly router = inject(Router);

  protected readonly departments = DEPARTMENTS;
  protected readonly countries = COUNTRIES;
  protected readonly roles = ROLES;
  protected readonly levels = LEVELS;
  protected readonly employmentTypes = EMPLOYMENT_TYPES;
  protected readonly alwaysShowErrors = new AlwaysShowErrorStateMatcher();

  // A signal, not a plain property like the rest of `form`: currency() must
  // recompute whenever it changes, which only works if reading it is a
  // signal read.
  protected readonly countryCode = signal('');

  // The server rejects a salary whose currency does not match the employee's
  // country (EmployeeService), so the currency is always derived here and
  // never offered as a free choice - see shared/reference.ts.
  protected readonly currency = computed(() => currencyForCountry(this.countryCode()) ?? '');

  form: FormState = { ...EMPTY_FORM };

  onCountryChange(code: string): void {
    this.countryCode.set(code);
  }

  onSubmit(): void {
    this.store.create(
      {
        employeeNumber: this.form.employeeNumber,
        fullName: this.form.fullName,
        email: this.form.email,
        department: this.form.department,
        countryCode: this.countryCode(),
        role: this.form.role,
        level: this.form.level,
        employmentType: this.form.employmentType,
        hireDate: this.form.hireDate,
        // The amount is never parsed - it travels from the input straight
        // through to the request body as the same string.
        salary: { amount: this.form.salaryAmount, currency: this.currency() },
        salaryEffectiveFrom: this.form.salaryEffectiveFrom,
      },
      id => void this.router.navigate(['/employees', id]),
    );
  }
}
