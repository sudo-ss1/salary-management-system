import { formatMoney } from './money';
import { MoneyPipe } from './money.pipe';

describe('formatMoney', () => {
  it('formats an amount with its own currency symbol', () => {
    expect(formatMoney({ amount: '125000.00', currency: 'USD' }, 'en-US')).toBe('$125,000.00');
  });

  it('formats a rupee amount in rupees, not in dollars', () => {
    const formatted = formatMoney({ amount: '3712500.00', currency: 'INR' }, 'en-IN');
    expect(formatted).toContain('₹');
    expect(formatted).not.toContain('$');
  });

  it('keeps full precision for an amount beyond the safe integer range', () => {
    // The guard against a double sneaking in: Number() would round this,
    // which is the double-for-money failure relocated to the browser.
    const formatted = formatMoney({ amount: '9007199254740993.00', currency: 'USD' }, 'en-US');
    expect(formatted).toContain('9,007,199,254,740,993');
  });

  it('returns an em dash for a missing amount rather than NaN', () => {
    expect(formatMoney(null, 'en-US')).toBe('—');
  });
});

describe('MoneyPipe', () => {
  it('delegates to formatMoney', () => {
    const pipe = new MoneyPipe('en-US');
    expect(pipe.transform({ amount: '1000.00', currency: 'USD' })).toBe('$1,000.00');
  });
});
