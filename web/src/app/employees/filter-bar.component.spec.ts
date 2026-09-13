import { TestBed } from '@angular/core/testing';
import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent', () => {
  async function render(showStatus = true) {
    await TestBed.configureTestingModule({ imports: [FilterBarComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FilterBarComponent);
    fixture.componentRef.setInput('value',
      { country: null, department: null, level: null, status: null });
    fixture.componentRef.setInput('showStatus', showStatus);
    fixture.detectChanges();
    return fixture;
  }

  it('offers all four filter dimensions', async () => {
    const fixture = await render();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('mat-label'))
      .map((el: any) => el.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['Country', 'Department', 'Level', 'Status']));
  });

  it('hides the status filter when the caller does not want it', async () => {
    const fixture = await render(false);
    const labels = Array.from(fixture.nativeElement.querySelectorAll('mat-label'))
      .map((el: any) => el.textContent.trim());
    expect(labels).not.toContain('Status');
  });

  it('emits the key and the value when a filter changes', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    fixture.componentInstance.onChange('country', 'IN');

    expect(emitted).toEqual([{ key: 'country', value: 'IN' }]);
  });

  it('emits null when a filter is cleared, never an empty string', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    fixture.componentInstance.onChange('level', '');

    // The server rejects an unparseable enum; an empty string is not a level.
    expect(emitted).toEqual([{ key: 'level', value: null }]);
  });
});
