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
    <a routerLink="/employees">Back to employees</a>
    <h1>Add employee</h1>

    <mat-card>
      <mat-form-field appearance="outline">
        <mat-label>Employee number</mat-label>
        <input matInput [(ngModel)]="form.employeeNumber" [errorStateMatcher]="alwaysShowErrors" />
        @if (store.fieldErrors()['employeeNumber']; as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Full name</mat-label>
        <input matInput [(ngModel)]="form.fullName" [errorStateMatcher]="alwaysShowErrors" />
        @if (store.fieldErrors()['fullName']; as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Email</mat-label>
        <input matInput type="email" [(ngModel)]="form.email" [errorStateMatcher]="alwaysShowErrors" />
        @if (store.fieldErrors()['email']; as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
        <mat-label>Hire date</mat-label>
        <input matInput type="date" [(ngModel)]="form.hireDate" [errorStateMatcher]="alwaysShowErrors" />
        <mat-hint>Cannot be in the future</mat-hint>
        @if (store.fieldErrors()['hireDate']; as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
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

      <mat-form-field appearance="outline">
        <mat-label>Salary effective from</mat-label>
        <input matInput type="date" [(ngModel)]="form.salaryEffectiveFrom"
               [errorStateMatcher]="alwaysShowErrors" />
        <mat-hint>On or after the hire date, and not in the future</mat-hint>
        @if (store.fieldErrors()['salaryEffectiveFrom']; as message) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>

      <div class="actions">
        <button mat-flat-button [disabled]="store.saving() || !countryCode()" (click)="onSubmit()">
          Create employee
        </button>
        <button mat-stroked-button routerLink="/employees" [disabled]="store.saving()">Cancel</button>
      </div>
    </mat-card>
  `,
  styles: [`
    mat-card { padding: 1.5rem; margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; }
    mat-form-field { flex: 1 1 16rem; }
    .actions { flex-basis: 100%; display: flex; gap: .75rem; }
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
