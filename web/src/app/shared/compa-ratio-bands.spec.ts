import { COMPA_RATIO_HIGH, COMPA_RATIO_LOW, isOutOfBand } from './compa-ratio-bands';

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
