import { fromIsoDate, toIsoDate } from './dates';

describe('date conversion at the API boundary', () => {
  it('formats a date as an ISO calendar date', () => {
    expect(toIsoDate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('pads single-digit months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('parses an ISO calendar date to local midnight, not UTC midnight', () => {
    const parsed = fromIsoDate('2026-09-01')!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getHours()).toBe(0);
  });

  /**
   * The bug this pair exists to prevent. `new Date('2026-09-01')` is UTC
   * midnight; read back with toISOString() west of Greenwich it is the 31st of
   * August. Round-tripping through these two must be lossless in every zone
   * the app runs in.
   */
  it('round-trips every day of a year without shifting', () => {
    for (let day = 0; day < 365; day++) {
      const date = new Date(2026, 0, 1 + day);
      expect(fromIsoDate(toIsoDate(date))!.getTime()).toBe(date.getTime());
    }
  });

  it('round-trips across a daylight-saving boundary', () => {
    for (const iso of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25']) {
      expect(toIsoDate(fromIsoDate(iso))).toBe(iso);
    }
  });

  it('treats empty, missing and unparseable values as no date', () => {
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(new Date('nonsense'))).toBe('');
    // A string slipping through from a caller still typed for the old
    // model must not throw partway through a submit.
    expect(toIsoDate('2026-09-01' as unknown as Date)).toBe('');
    expect(fromIsoDate('')).toBeNull();
    expect(fromIsoDate('01-09-2026')).toBeNull();
    expect(fromIsoDate(undefined)).toBeNull();
  });
});
