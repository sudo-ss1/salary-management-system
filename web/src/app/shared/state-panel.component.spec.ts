import { TestBed } from '@angular/core/testing';
import { StatePanelComponent } from './state-panel.component';

describe('StatePanelComponent', () => {
  async function render(inputs: Record<string, unknown>) {
    await TestBed.configureTestingModule({ imports: [StatePanelComponent] }).compileComponents();
    const fixture = TestBed.createComponent(StatePanelComponent);
    Object.entries(inputs).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    fixture.detectChanges();
    return fixture;
  }

  it('shows a spinner while loading', async () => {
    const fixture = await render({ state: { status: 'loading' }, isEmpty: false, emptyMessage: '' });
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).toBeTruthy();
  });

  it('distinguishes an unreachable server from an empty result', async () => {
    const fixture = await render({
      state: { status: 'error', error: { status: 0, title: 'Cannot reach the server',
        detail: 'We could not reach the server. Check your connection and try again.',
        fieldErrors: {}, isConflict: false } },
      isEmpty: false,
      emptyMessage: 'No employees match these filters',
    });

    expect(fixture.nativeElement.textContent).toContain('reach the server');
    expect(fixture.nativeElement.textContent).not.toContain('No employees match');
  });

  it('offers a retry when the request failed', async () => {
    const fixture = await render({
      state: { status: 'error', error: { status: 500, title: 'Something went wrong',
        detail: 'The request could not be completed.', fieldErrors: {}, isConflict: false } },
      isEmpty: false, emptyMessage: '',
    });
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Try again');
  });

  it('shows the caller-supplied empty message when the result set is empty', async () => {
    const fixture = await render({
      state: { status: 'ready', data: {} }, isEmpty: true,
      emptyMessage: 'No employees match these filters',
    });
    expect(fixture.nativeElement.textContent).toContain('No employees match these filters');
  });

  it('renders nothing at all once there is data to show', async () => {
    const fixture = await render({
      state: { status: 'ready', data: {} }, isEmpty: false, emptyMessage: 'unused',
    });
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
