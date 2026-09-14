import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { COUNTRIES, DEPARTMENTS, LEVELS, STATUSES } from '../shared/reference';

export interface FilterValues {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
}

export interface FilterChange {
  readonly key: keyof FilterValues;
  readonly value: string | null;
}

/**
 * Shared by the employee list and the insights screen. Same four dimensions,
 * same options, same validation - one place to change them.
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Country</mat-label>
        <mat-select canSelectNullableOptions [value]="value().country" (valueChange)="onChange('country', $event)">
          <mat-option [value]="null">All countries</mat-option>
          @for (option of countries; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Department</mat-label>
        <mat-select canSelectNullableOptions [value]="value().department" (valueChange)="onChange('department', $event)">
          <mat-option [value]="null">All departments</mat-option>
          @for (option of departments; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Level</mat-label>
        <mat-select canSelectNullableOptions [value]="value().level" (valueChange)="onChange('level', $event)">
          <mat-option [value]="null">All levels</mat-option>
          @for (option of levels; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (showStatus()) {
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select canSelectNullableOptions [value]="value().status" (valueChange)="onChange('status', $event)">
            <mat-option [value]="null">Active and inactive</mat-option>
            @for (option of statuses; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>
  `,
  styles: [`
    // A compact, wrapping control strip at natural widths - these are filters,
    // not the main content, so they should not stretch to fill the viewport.
    .filters { display: flex; flex-wrap: wrap; gap: var(--space-3); }
    mat-form-field { width: 12.5rem; flex: 0 0 auto; }
  `],
})
export class FilterBarComponent {
  readonly value = input.required<FilterValues>();
  readonly showStatus = input(true);
  readonly changed = output<FilterChange>();

  protected readonly countries = COUNTRIES;
  protected readonly departments = DEPARTMENTS;
  protected readonly levels = LEVELS;
  protected readonly statuses = STATUSES;

  onChange(key: keyof FilterValues, value: string): void {
    // Empty means "no filter", and the server would reject an empty enum.
    this.changed.emit({ key, value: value === '' ? null : value });
  }
}
