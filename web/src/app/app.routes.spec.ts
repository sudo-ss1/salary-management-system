import { routes } from './app.routes';
import { EmployeeListComponent } from './employees/employee-list.component';
import { CreateEmployeeComponent } from './employees/create-employee.component';
import { EmployeeDetailComponent } from './employees/employee-detail.component';
import { InsightsComponent } from './insights/insights.component';

describe('application routes', () => {
  it('redirects the empty path to the employee list', () => {
    const root = routes.find(r => r.path === '');
    expect(root?.redirectTo).toBe('/employees');
  });

  it('lazy loads every feature route rather than bundling them into the shell', () => {
    const features = routes.filter(r => r.path !== '' && r.path !== '**');
    expect(features.length).toBe(4);
    features.forEach(route => expect(typeof route.loadComponent).toBe('function'));
  });

  it('exposes the screens the two user jobs need', () => {
    const paths = routes.map(r => r.path);
    expect(paths).toEqual(
      expect.arrayContaining(['employees', 'employees/new', 'employees/:id', 'insights']),
    );
  });

  it('resolves each path to its own distinct screen', async () => {
    const find = (path: string) => routes.find(r => r.path === path)!;

    await expect(find('employees').loadComponent!()).resolves.toBe(EmployeeListComponent);
    await expect(find('employees/new').loadComponent!()).resolves.toBe(CreateEmployeeComponent);
    await expect(find('employees/:id').loadComponent!()).resolves.toBe(EmployeeDetailComponent);
    await expect(find('insights').loadComponent!()).resolves.toBe(InsightsComponent);
  });

  it('lists employees/new before employees/:id, or the router would match "new" as an id', () => {
    const newIndex = routes.findIndex(r => r.path === 'employees/new');
    const idIndex = routes.findIndex(r => r.path === 'employees/:id');
    expect(newIndex).toBeGreaterThanOrEqual(0);
    expect(newIndex).toBeLessThan(idIndex);
  });
});
