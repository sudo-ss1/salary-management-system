import { Routes } from '@angular/router';

/**
 * Three routes, one per user intent. Each is lazy so the insights bundle -
 * which carries the chart library - never loads for someone who only came to
 * correct an employee record.
 */
export const routes: Routes = [
  { path: '', redirectTo: '/employees', pathMatch: 'full' },
  {
    path: 'employees',
    loadComponent: () =>
      import('./employees/employee-list.component').then(m => m.EmployeeListComponent),
  },
  {
    path: 'employees/:id',
    loadComponent: () =>
      import('./employees/employee-detail.component').then(m => m.EmployeeDetailComponent),
  },
  {
    path: 'insights',
    loadComponent: () => import('./insights/insights.component').then(m => m.InsightsComponent),
  },
  { path: '**', redirectTo: '/employees' },
];
