import { currencyForCountry } from './reference';

describe('currencyForCountry', () => {
  it('derives the currency the V1 migration seeded for each country', () => {
    // com.payscope.currency.Country / V1__country_and_fx_rate.sql is the sole
    // authority - these six pairs must track its insert statements exactly.
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('SG')).toBe('SGD');
    expect(currencyForCountry('BR')).toBe('BRL');
  });

  it('returns undefined for a country with no seeded currency, rather than guessing', () => {
    expect(currencyForCountry('ZZ')).toBeUndefined();
  });
});
