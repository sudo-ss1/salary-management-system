import {
  COMPA_RATIO_HIGH, COMPA_RATIO_LOW, compaRatioGap, compaRatioPercent, compaRatioShort,
  isOutOfBand,
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

describe('compaRatioShort', () => {
  it('shortens four decimals to two', () => {
    expect(compaRatioShort('1.1345')).toBe('1.13');
  });

  it('rounds rather than truncates', () => {
    expect(compaRatioShort('0.6989')).toBe('0.70');
  });

  it('keeps a trailing zero, so the column stays aligned', () => {
    expect(compaRatioShort('1.2000')).toBe('1.20');
  });

  // The ratio and the percentage sit in the same sentence. toFixed(2) alone
  // would print "1.00" beside "101%" for this value.
  it('never contradicts the percentage beside it, including at a binary half', () => {
    for (const ratio of ['1.0050', '0.8850', '0.6989', '1.1345', '1.2050']) {
      const percent = Number(compaRatioPercent(ratio).replace('%', ''));
      expect(Number(compaRatioShort(ratio)) * 100).toBeCloseTo(percent, 6);
    }
  });
});
