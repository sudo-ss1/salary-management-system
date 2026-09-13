import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CompaRatioHistogramComponent } from './compa-ratio-histogram.component';

const BUCKETS = [
  { bucket: 'LT_80' as const, headcount: 1 },
  { bucket: 'B80_90' as const, headcount: 2 },
  { bucket: 'B90_110' as const, headcount: 5 },
  { bucket: 'B110_120' as const, headcount: 2 },
  { bucket: 'GT_120' as const, headcount: 2 },
];

describe('CompaRatioHistogramComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [CompaRatioHistogramComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompaRatioHistogramComponent);
    fixture.componentRef.setInput('buckets', BUCKETS);
    fixture.detectChanges();
    return fixture;
  }

  it('labels each band in percentages a non-technical reader can act on', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.series().map(p => p.name)).toEqual([
      'Under 80%', '80-90%', '90-110%', '110-120%', 'Over 120%',
    ]);
  });

  it('keeps the bands in order so the shape of the distribution is visible', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.series().map(p => p.value)).toEqual([1, 2, 5, 2, 2]);
  });

  it('colours only the two out-of-band bars as problems', async () => {
    const fixture = await render();
    const scheme = fixture.componentInstance.colourScheme.domain;
    expect(scheme[0]).toBe(fixture.componentInstance.outOfBandColour);
    expect(scheme[4]).toBe(fixture.componentInstance.outOfBandColour);
    expect(scheme[2]).not.toBe(fixture.componentInstance.outOfBandColour);
  });

  it('emits the band when a bar is clicked, so the outlier table can be filtered', async () => {
    const fixture = await render();
    const emitted: string[] = [];
    fixture.componentInstance.bucketSelected.subscribe((b: string) => emitted.push(b));

    fixture.componentInstance.onSelect({ name: 'Under 80%', value: 1 });

    expect(emitted).toEqual(['LT_80']);
  });
});
