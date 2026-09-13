import { routes } from './app.routes';

describe('application routes', () => {
  it('redirects the empty path to the employee list', () => {
    const root = routes.find(r => r.path === '');
    expect(root?.redirectTo).toBe('/employees');
  });

  it('lazy loads every feature route rather than bundling them into the shell', () => {
    const features = routes.filter(r => r.path !== '' && r.path !== '**');
    expect(features.length).toBe(3);
    features.forEach(route => expect(typeof route.loadComponent).toBe('function'));
  });

  it('exposes the three screens the two user jobs need', () => {
    const paths = routes.map(r => r.path);
    expect(paths).toEqual(expect.arrayContaining(['employees', 'employees/:id', 'insights']));
  });
});
