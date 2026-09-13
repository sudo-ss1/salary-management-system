import { TestBed } from '@angular/core/testing';
import { SummaryTilesComponent } from './summary-tiles.component';

const SUMMARY = {
  headcount: 12,
  totalCostToCompanyUsd: { amount: '1405077.50', currency: 'USD' },
  meanBaseUsd: { amount: '117089.79', currency: 'USD' },
  unbandedCount: 1,
  compaRatioBuckets: [],
};

describe('SummaryTilesComponent', () => {
  async function render(summary = SUMMARY) {
    await TestBed.configureTestingModule({ imports: [SummaryTilesComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SummaryTilesComponent);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return fixture;
  }

  it('states the payroll total in one currency and says which', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('$1,405,077.50');
    expect(text).toContain('USD');
  });

  it('reports employees with no pay band rather than hiding them', async () => {
    const fixture = await render();
    // Dropping them silently would make the outlier list quietly incomplete.
    expect(fixture.nativeElement.textContent).toContain('1');
    expect(fixture.nativeElement.textContent).toContain('no pay band');
  });

  it('omits the unbanded tile when every employee has a band', async () => {
    const fixture = await render({ ...SUMMARY, unbandedCount: 0 });
    expect(fixture.nativeElement.textContent).not.toContain('no pay band');
  });
});
