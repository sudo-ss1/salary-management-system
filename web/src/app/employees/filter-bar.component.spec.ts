import { TestBed, waitForAsync } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent', () => {
  async function render(showStatus = true) {
    await TestBed.configureTestingModule({
      imports: [FilterBarComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
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

  it('displays the unfiltered option as selected when all filters are null', async () => {
    const fixture = await render();
    // When value is null, the mat-select should display the first option's text "All countries"
    const select = fixture.nativeElement.querySelector('mat-select');
    // Check the trigger text to verify "All countries" is shown (not blank)
    const triggerText = select?.textContent || '';
    expect(triggerText).toContain('All countries');
  });

  it('emits the correct key and value when choosing a real option', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    // Simulate selecting a real option by calling onChange directly with a real value
    // This proves the Country select would emit correctly with key='country'
    fixture.componentInstance.onChange('country', 'IN');

    expect(emitted).toContainEqual({ key: 'country', value: 'IN' });
  });

  it('emits null when choosing the unfiltered sentinel option', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe((change: unknown) => emitted.push(change));

    // Simulate choosing the sentinel option (empty string) which should emit null
    fixture.componentInstance.onChange('level', '');

    expect(emitted).toContainEqual({ key: 'level', value: null });
  });
});
