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
    <a routerLink="/employees">Back to employees</a>

    <app-state-panel [state]="store.state()" (retry)="store.load(+id())" />

    @if (employee(); as person) {
      <h1>{{ person.fullName }}</h1>

      @if (store.conflict()) {
        <div class="conflict" role="alert">
          <span>This record changed since you opened it. Reload to see the current values.</span>
          <button mat-stroked-button (click)="store.load(+id())">Reload</button>
        </div>
      }

      <mat-tab-group>
        <mat-tab label="Details">
          <mat-card>
            <mat-form-field appearance="outline">
              <mat-label>Full name</mat-label>
              <input matInput [(ngModel)]="form.fullName" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput [(ngModel)]="form.email" />
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
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Role</mat-label>
              <mat-select [(ngModel)]="form.role">
                @for (option of roles; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Level</mat-label>
              <mat-select [(ngModel)]="form.level">
                @for (option of levels; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Employment type</mat-label>
              <mat-select [(ngModel)]="form.employmentType">
                @for (option of employmentTypes; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <div class="actions">
              <button mat-flat-button [disabled]="store.saving()" (click)="onSave()">Save</button>
              <button mat-stroked-button [disabled]="store.saving()"
                      (click)="store.deactivate(+id())">Deactivate</button>
            </div>
          </mat-card>

          <mat-card class="pay">
            <h2>Current pay</h2>
            <p class="figure">{{ person.salary | money }}</p>
            <p class="muted">{{ person.salaryBaseUsd | money }} at the recorded rate</p>
            <button mat-stroked-button (click)="openRaiseDialog(person)">Record a raise</button>

            @if (person.bandMid) {
              <p>
                Compa-ratio <strong>{{ person.compaRatio }}</strong>
                against a band midpoint of {{ person.bandMid | money }}
                (range {{ person.bandMin | money }} to {{ person.bandMax | money }}).
              </p>
            } @else {
              <p class="muted">
                No pay band exists for {{ label(person.role) }} at {{ label(person.level) }} in
                {{ person.countryCode }}, so no compa-ratio can be calculated.
              </p>
            }
          </mat-card>
        </mat-tab>

        <mat-tab label="Salary history">
          <ng-template matTabContent>
            <app-salary-history [employeeId]="+id()" />
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .conflict { display: flex; align-items: center; gap: 1rem; padding: .75rem 1rem;
                border: 1px solid var(--mat-sys-error, #b3261e); border-radius: 4px; margin: 1rem 0; }
    mat-card { padding: 1.5rem; margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; }
    mat-form-field { flex: 1 1 16rem; }
    .actions { flex-basis: 100%; display: flex; gap: .75rem; }
    .pay { display: block; }
    .figure { font-size: 1.75rem; margin: .25rem 0; }
    .muted { opacity: .7; }
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
