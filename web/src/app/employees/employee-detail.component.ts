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
import { InfoButtonComponent } from '../shared/info-button.component';
import { AlwaysShowErrorStateMatcher } from '../shared/always-error-state-matcher';
import {
  compaRatioGap, compaRatioPercent, compaRatioShort, isOutOfBand,
} from '../shared/compa-ratio-bands';
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
    InfoButtonComponent,
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
              <span class="pay-figure__secondary">
                <!--
                  Not a second salary: the same pay normalised to USD so it can
                  be added to salaries from five other countries. Naming the
                  rate and its date is what makes ADR-0001's frozen conversion
                  auditable on screen rather than only true in the database.
                -->
                &asymp; <span class="numeric">{{ person.salaryBaseUsd | money }}</span> USD
                @if (person.fxRate && person.fxRateDate) {
                  &middot; converted at
                  <span class="numeric">{{ person.salary.currency }}&nbsp;1 = {{ usdPerUnit(person) }}</span>,
                  the rate recorded on {{ person.fxRateDate }}
                }
              </span>
            </div>

            <!--
              The headline is a percentage, not the raw ratio. requirements.md
              names a non-technical HR manager as the user, and an unlabelled
              "0.8978" tells them nothing - "90% of midpoint" is the unit the
              pay conversation actually happens in. The exact ratio stays in
              the sentence, so no precision is hidden, only de-emphasised.
            -->
            @if (person.bandMid) {
              <div class="compa-explain">
                <div class="compa-ratio" [class.out-of-band]="isOutOfBand(person.compaRatio ?? '')">
                  <span class="compa-ratio__value numeric">{{ compaPercent(person.compaRatio ?? '') }}</span>
                  <span class="compa-ratio__label">of band midpoint</span>
                </div>

                <app-info-button label="What compa-ratio means">
                  <h3 class="info-panel__title">Compa-ratio</h3>
                  <p>
                    Someone's pay compared with the <strong>midpoint</strong> of their pay band —
                    the band set for their role, level and country.
                  </p>
                  <p>
                    <strong>100%</strong> is exactly at the midpoint. Below <strong>80%</strong> or
                    above <strong>120%</strong> is flagged as an outlier and worth a look: usually
                    underpayment on one side, and someone near the ceiling for their level on the
                    other.
                  </p>
                  <p>
                    Both figures are in the same local currency, so no exchange rate is involved.
                    That is what makes it comparable across countries — 90% means the same thing in
                    Bengaluru as it does in London.
                  </p>
                </app-info-button>
                <p>
                  Paid {{ compaGap(person.compaRatio ?? '') }} for {{ label(person.level) }}
                  {{ label(person.role) }} in {{ person.countryCode }} — a compa-ratio of
                  {{ compaShort(person.compaRatio ?? '') }}. The band runs {{ person.bandMin | money }} to
                  {{ person.bandMax | money }}, with a midpoint of
                  <strong>{{ person.bandMid | money }}</strong>.
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
    .compa-explain app-info-button { flex-shrink: 0; }
    .compa-explain p { margin: 0; color: var(--mat-sys-on-surface-variant); }

    .compa-ratio {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      padding: var(--space-2) var(--space-4);
      border-radius: var(--mat-sys-corner-medium, 12px);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
    .compa-ratio__value { font-size: 1.5rem; font-weight: 600; line-height: 1.15; }
    .compa-ratio__label { font: var(--mat-sys-label-small); margin-top: 2px; }
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
  protected readonly compaPercent = compaRatioPercent;
  protected readonly compaGap = compaRatioGap;
  protected readonly compaShort = compaRatioShort;

  /**
   * The stored rate, formatted as currency and never rounded. fx_rate is held
   * as USD per unit of the local currency (INR sits at 0.012), so this is the
   * database's own number with a currency symbol on it - no arithmetic, and in
   * particular no inversion to the more familiar "$1 = Rs 83.33", which would
   * mean inventing a repeating decimal the system never recorded.
   */
  protected usdPerUnit(person: EmployeeDetail): string {
    return `$${person.fxRate}`;
  }
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
