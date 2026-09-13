import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { take } from 'rxjs';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { SORT_OPTIONS, titleCase } from '../shared/reference';
import { FilterBarComponent, FilterChange } from './filter-bar.component';
import { EmployeeListStore } from './employee-list.store';
import { EmployeeSort, SortDirection } from './employee.models';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    RouterLink, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MoneyPipe, StatePanelComponent, FilterBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Employees</h1>

    <mat-form-field appearance="outline" class="search">
      <mat-label>Search name, email or employee number</mat-label>
      <input matInput [value]="store.search()" (input)="onSearch($event)" />
    </mat-form-field>

    <app-filter-bar [value]="filters()" (changed)="onFilterChange($event)" />

    <mat-form-field appearance="outline" class="sort">
      <mat-label>Sort by</mat-label>
      <mat-select [value]="store.sort()" (valueChange)="onSort($event)">
        @for (option of sortOptions; track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <app-state-panel
      [state]="store.state()"
      [isEmpty]="rows().length === 0"
      emptyMessage="No employees match these filters"
      (retry)="store.setPage(store.page())" />

    @if (rows().length > 0) {
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let row">
            <a [routerLink]="['/employees', row.id]">{{ row.fullName }}</a>
            <span class="muted">{{ row.employeeNumber }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="role">
          <th mat-header-cell *matHeaderCellDef>Role</th>
          <td mat-cell *matCellDef="let row">
            {{ label(row.role) }}<span class="muted">{{ label(row.level) }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="country">
          <th mat-header-cell *matHeaderCellDef>Country</th>
          <td mat-cell *matCellDef="let row">{{ row.countryCode }}</td>
        </ng-container>

        <ng-container matColumnDef="salary">
          <th mat-header-cell *matHeaderCellDef>Salary</th>
          <td mat-cell *matCellDef="let row">
            {{ row.salary | money }}<span class="muted">{{ row.salaryBaseUsd | money }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="compaRatio">
          <th mat-header-cell *matHeaderCellDef>Compa-ratio</th>
          <td mat-cell *matCellDef="let row">
            @if (row.compaRatio) {
              <span class="compa-ratio" [class.out-of-band]="outOfBand(row.compaRatio)">
                {{ row.compaRatio }}
              </span>
            } @else {
              <span class="muted" title="No pay band exists for this role, level and country">
                No band
              </span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let row">{{ label(row.status) }}</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    }

    <mat-paginator
      [length]="store.totalElements()"
      [pageIndex]="store.page()"
      [pageSize]="store.size()"
      [pageSizeOptions]="[10, 25, 50, 100]"
      (page)="onPage($event)" />
  `,
  styles: [`
    .search { width: 100%; max-width: 32rem; }
    .sort { min-width: 14rem; margin-top: .5rem; }
    table { width: 100%; margin-top: 1rem; }
    .muted { display: block; font-size: .8rem; opacity: .65; }
    .compa-ratio { font-variant-numeric: tabular-nums; }
    .out-of-band { color: var(--mat-sys-error, #b3261e); font-weight: 600; }
  `],
})
export class EmployeeListComponent {
  protected readonly store = inject(EmployeeListStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly columns = ['name', 'role', 'country', 'salary', 'compaRatio', 'status'];
  protected readonly label = titleCase;

  constructor() {
    // Read once on entry so a shared or bookmarked URL restores its view...
    this.route.queryParams.pipe(take(1)).subscribe(params => this.store.applyQueryParams(params));

    // ...then keep the URL in step, replacing rather than pushing so the back
    // button leaves the list instead of walking through every filter change.
    effect(() => {
      const queryParams = this.store.toQueryParams();
      void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
    });
  }

  protected rows() {
    const state = this.store.state();
    return state.status === 'ready' ? state.data.content : [];
  }

  protected filters() {
    return {
      country: this.store.country(),
      department: this.store.department(),
      level: this.store.level(),
      status: this.store.status(),
    };
  }

  /** A ratio is a decimal string; comparing as a number here is display logic, not money maths. */
  protected outOfBand(compaRatio: string): boolean {
    const value = Number(compaRatio);
    return value < 0.8 || value > 1.2;
  }

  protected onSearch(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  protected onFilterChange(change: FilterChange): void {
    this.store.setFilter(change.key, change.value);
  }

  protected onSort(sort: EmployeeSort): void {
    this.store.setSort(sort, this.store.direction() as SortDirection);
  }

  protected onPage(event: PageEvent): void {
    if (event.pageSize !== this.store.size()) {
      this.store.setSize(event.pageSize);
    } else {
      this.store.setPage(event.pageIndex);
    }
  }
}
