import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { take } from 'rxjs';
import { MoneyPipe } from '../core/money.pipe';
import { StatePanelComponent } from '../shared/state-panel.component';
import { COUNTRIES, SORT_OPTIONS, titleCase } from '../shared/reference';
import { compaRatioPercent, isOutOfBand } from '../shared/compa-ratio-bands';
import { CompaRatioInfoComponent } from '../shared/compa-ratio-info.component';
import { FilterBarComponent, FilterChange } from './filter-bar.component';
import { EmployeeListStore } from './employee-list.store';
import { EmployeeSort, SortDirection } from './employee.models';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    RouterLink, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MatButtonModule, MoneyPipe, StatePanelComponent, FilterBarComponent,
    CompaRatioInfoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header__text">
        <h1>Employees</h1>
        <span class="page-header__context">{{ resultCount() }}</span>
      </div>
      <div class="page-header__actions">
        <a mat-flat-button routerLink="/employees/new">Add employee</a>
      </div>
    </div>

    <div class="control-strip">
      <mat-form-field appearance="outline" class="search">
        <mat-label>Search name, email or employee number</mat-label>
        <input matInput [value]="store.search()" (input)="onSearch($event)" />
      </mat-form-field>

      <div class="filter-row">
        <app-filter-bar [value]="filters()" (changed)="onFilterChange($event)" />

        <mat-form-field appearance="outline" class="sort">
          <mat-label>Sort by</mat-label>
          <mat-select [value]="store.sort()" (valueChange)="onSort($event)">
            @for (option of sortOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <!--
          Disabled when nothing is narrowing the list, so the control tells the
          user whether anything is filtered without them having to read five
          other controls to find out. Sort is not cleared - that is how they
          prefer to read the list, not a narrowing of it.
        -->
        <button mat-stroked-button class="reset" type="button"
                [disabled]="!store.hasNarrowing()" (click)="onReset()">
          Reset
        </button>
      </div>
    </div>

    <app-state-panel
      [state]="store.state()"
      [isEmpty]="rows().length === 0"
      emptyMessage="No employees match these filters"
      (retry)="store.setPage(store.page())" />

    @if (rows().length > 0) {
      <div class="surface-card table-card">
        <div class="table-scroll">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let row">
                <a class="cell-primary" [routerLink]="['/employees', row.id]">{{ row.fullName }}</a>
                <span class="cell-secondary">{{ row.employeeNumber }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>Role</th>
              <td mat-cell *matCellDef="let row">
                <span class="cell-primary">{{ label(row.role) }}</span>
                <span class="cell-secondary">{{ label(row.level) }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="country">
              <th mat-header-cell *matHeaderCellDef>Country</th>
              <td mat-cell *matCellDef="let row">{{ row.countryCode }}</td>
            </ng-container>

            <ng-container matColumnDef="salary">
              <th mat-header-cell *matHeaderCellDef class="numeric-col">Salary</th>
              <td mat-cell *matCellDef="let row" class="numeric-col">
                <span class="cell-primary numeric">{{ row.salary | money }}</span>
                <span class="cell-secondary numeric">{{ row.salaryBaseUsd | money }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="compaRatio">
              <!-- The list is where most people meet the term for the first
                   time, so the explanation belongs on the column, not only on
                   the record behind it. -->
              <th mat-header-cell *matHeaderCellDef class="compa-col">
                <span class="header-with-info">
                  Compa-ratio
                  <app-compa-ratio-info />
                </span>
              </th>
              <td mat-cell *matCellDef="let row" class="compa-col">
                @if (row.compaRatio) {
                  <!-- A percentage of the band midpoint, scanned down a column of
                       10,000 rows. "113%" reads at a glance where "1.1345" does
                       not, and the precision buys nothing at this density. -->
                  <span class="compa-ratio numeric" [class.out-of-band]="outOfBand(row.compaRatio)">
                    {{ compaPercent(row.compaRatio) }}
                  </span>
                } @else {
                  <span class="cell-secondary" title="No pay band exists for this role, level and country">
                    No band
                  </span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let row">
                <span class="chip" [attr.data-tone]="row.status === 'ACTIVE' ? 'positive' : null">
                  {{ label(row.status) }}
                </span>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      </div>
    }

    <mat-paginator
      [length]="store.totalElements()"
      [pageIndex]="store.page()"
      [pageSize]="store.size()"
      [pageSizeOptions]="[10, 25, 50, 100]"
      (page)="onPage($event)" />
  `,
  styles: [`
    // Centred, not right-aligned like the money columns. The values here are
    // chips rather than digits - nothing lines up decimal-wise, so there is no
    // edge worth sharing, and a right-aligned header carrying a control could
    // never agree with the chips beneath it however the two were ordered.
    // Centring the whole column removes the disagreement instead of chasing it.
    .compa-col { text-align: center; }

    .header-with-info {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    // Aligns with the form fields beside it, which carry their own subscript
    // space beneath - without this the button sits low against them.
    .reset { align-self: flex-start; margin-top: 0.5rem; }

    .search { width: 100%; }
    .search .mat-mdc-text-field-wrapper { background: transparent; }

    .filter-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .sort { width: 14rem; flex: 0 0 auto; }

    .table-card { padding: 0; overflow: hidden; }
    .table-scroll { max-height: 70vh; overflow: auto; }

    table { width: 100%; }

    // Column meaning must survive scrolling 10,000 rows.
    th.mat-mdc-header-cell {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface-variant);
    }

    tr.mat-mdc-row:hover {
      background: var(--mat-sys-surface-container);
    }

    tr.mat-mdc-row td {
      border-bottom-color: var(--mat-sys-outline-variant);
    }

    .cell-primary { display: block; }
    .cell-primary[routerLink] { text-decoration: none; font-weight: 500; }
    .cell-primary[routerLink]:hover { text-decoration: underline; }

    // Figures are scanned down a column, so their whole cell - header and
    // data - sits flush right rather than following the table's default
    // left alignment.
    .numeric-col { text-align: right; }

    .compa-ratio {
      display: inline-flex;
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }

    .compa-ratio.out-of-band {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font-weight: 600;
    }
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

  /** The page-header context line: a count that explains what "Employees" means right now. */
  protected resultCount(): string {
    const state = this.store.state();
    const total = state.status === 'ready' ? state.data.totalElements : 0;
    const formatted = total.toLocaleString();
    const country = this.store.country();
    if (country) {
      const countryLabel = COUNTRIES.find(option => option.value === country)?.label ?? country;
      return `${formatted} in ${countryLabel}`;
    }
    return `${formatted} employees`;
  }

  protected filters() {
    return {
      country: this.store.country(),
      department: this.store.department(),
      level: this.store.level(),
      status: this.store.status(),
    };
  }

  protected readonly outOfBand = isOutOfBand;

  protected readonly compaPercent = compaRatioPercent;

  protected onSearch(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  protected onFilterChange(change: FilterChange): void {
    this.store.setFilter(change.key, change.value);
  }

  protected onReset(): void {
    this.store.clearFilters();
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
