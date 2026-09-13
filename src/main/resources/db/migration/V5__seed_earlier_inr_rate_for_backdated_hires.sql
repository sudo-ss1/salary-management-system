-- V1 seeded exactly one rate per currency, dated 2026-01-01. That is fine for
-- rates going forward, but an employee hired before 2026 (a normal, expected
-- case - see spec section 8) has no INR rate on or before their hire date, and
-- salary creation would wrongly fail with "no exchange rate". This backdates
-- the INR rate so historical INR hires convert; it deliberately does not touch
-- any other currency, so the CurrencyConverterTest case that expects "no rate
-- before 2025-12-31" for GBP keeps failing exactly as it did before.
insert into fx_rate (currency_code, rate_date, rate_to_usd) values
    ('INR', date '2000-01-01', 0.01200000);
