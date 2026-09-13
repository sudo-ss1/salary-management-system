import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MedianPayChartComponent } from './median-pay-chart.component';
import { DistributionGroup } from './analytics.models';

const GROUPS: DistributionGroup[] = [
  {
    key: { country: 'IN' }, headcount: 3,
    p25: { amount: '40095.00', currency: 'USD' }, p50: { amount: '44550.00', currency: 'USD' },
    p75: { amount: '50118.75', currency: 'USD' }, p90: { amount: '53460.00', currency: 'USD' },
    mean: { amount: '45292.50', currency: 'USD' }, medianCompaRatio: '1.0000',
  },
  {
    key: { country: 'US' }, headcount: 5,
    p25: { amount: '148500.00', currency: 'USD' }, p50: { amount: '148500.00', currency: 'USD' },
    p75: { amount: '193050.00', currency: 'USD' }, p90: { amount: '197220.00', currency: 'USD' },
    mean: { amount: '158800.00', currency: 'USD' }, medianCompaRatio: '1.0000',
  },
];

describe('MedianPayChartComponent', () => {
  async function render(groups: DistributionGroup[]) {
    await TestBed.configureTestingModule({
      imports: [MedianPayChartComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    const fixture = TestBed.createComponent(MedianPayChartComponent);
    fixture.componentRef.setInput('groups', groups);
    fixture.detectChanges();
    return fixture;
  }

  it('feeds the chart one precomputed median per group', async () => {
    const fixture = await render(GROUPS);
    // No statistics in the browser: these are the server's p50 values, not
    // anything this component calculated - ADR-0006.
    expect(fixture.componentInstance.series()).toEqual([
      { name: 'IN', value: 44550 },
      { name: 'US', value: 148500 },
    ]);
  });

  it('labels each group with the exact string the server sent, not the chart number', async () => {
    const fixture = await render(GROUPS);
    // The number drives pixels only. Every figure the user reads is formatted
    // from the original string.
    expect(fixture.componentInstance.formatValue(44550)).toBe('$44,550.00');
  });

  it('joins two grouping dimensions into one readable label', async () => {
    const fixture = await render([
      { ...GROUPS[0], key: { country: 'IN', level: 'SENIOR' } },
    ]);
    expect(fixture.componentInstance.series()[0].name).toBe('IN · Senior');
  });

  it('labels the single whole-organization group rather than showing a blank axis', async () => {
    const fixture = await render([{ ...GROUPS[0], key: {} }]);
    expect(fixture.componentInstance.series()[0].name).toBe('Whole organization');
  });

  it('skips a group with no median rather than plotting it as zero', async () => {
    const fixture = await render([{ key: { country: 'BR' }, headcount: 0 }]);
    expect(fixture.componentInstance.series()).toEqual([]);
  });

  it('renders an svg, proving the chart library works without zone.js', async () => {
    const fixture = await render(GROUPS);
    expect(fixture.nativeElement.querySelector('svg')).toBeTruthy();
  });
});
