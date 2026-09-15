import {
  COMPA_RATIO_HIGH, COMPA_RATIO_LOW, compaRatioGap, compaRatioPercent, isOutOfBand,
} from './compa-ratio-bands';

describe('isOutOfBand', () => {
  it('flags a ratio below the low threshold', () => {
    expect(isOutOfBand('0.7000')).toBe(true);
  });

  it('flags a ratio above the high threshold', () => {
    expect(isOutOfBand('1.3000')).toBe(true);
  });

  it('does not flag a ratio inside the band', () => {
    expect(isOutOfBand('1.0000')).toBe(false);
  });

  it('does not flag the edges themselves', () => {
    expect(isOutOfBand(String(COMPA_RATIO_LOW))).toBe(false);
    expect(isOutOfBand(String(COMPA_RATIO_HIGH))).toBe(false);
  });
});

describe('compaRatioPercent', () => {
  it('reads a ratio as a whole percentage of the midpoint', () => {
    expect(compaRatioPercent('0.8978')).toBe('90%');
  });

  it('renders the midpoint itself as 100%', () => {
    expect(compaRatioPercent('1.0000')).toBe('100%');
  });
});

describe('compaRatioGap', () => {
  it('names the direction and size of the gap below the midpoint', () => {
    expect(compaRatioGap('0.8978')).toBe('10% below the midpoint');
  });

  it('names the direction and size of the gap above it', () => {
    expect(compaRatioGap('1.1500')).toBe('15% above the midpoint');
  });

  it('says "at the midpoint" rather than "0% below" when they coincide', () => {
    expect(compaRatioGap('1.0000')).toBe('at the midpoint');
  });

  // The headline percentage and the gap sentence appear side by side, so a
  // reader can add them. If rounding ever let them disagree - "89% of
  // midpoint" beside "10% below" - the screen would contradict itself.
  it('never disagrees with the percentage it is shown beside', () => {
    for (const ratio of ['0.7550', '0.8750', '0.8850', '0.8950', '1.0050', '1.1250']) {
      const percent = Number(compaRatioPercent(ratio).replace('%', ''));
      const gap = compaRatioGap(ratio);
      const delta = gap === 'at the midpoint' ? 0 : Number(gap.match(/^(\d+)%/)![1]);
      const signed = gap.includes('below') ? -delta : delta;
      expect(percent).toBe(100 + signed);
    }
  });
});
