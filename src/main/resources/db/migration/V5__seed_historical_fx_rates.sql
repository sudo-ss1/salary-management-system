-- V1 seeds the current rate for each currency, dated 2026-01-01. Salaries are
-- routinely effective from a past hire date, and the converter resolves the most
-- recent rate on or before that date, so without a historical baseline every
-- backdated salary fails to convert. The values match the 2026 rows: these are a
-- baseline that makes historical conversion possible, not a rate history.
insert into fx_rate (currency_code, rate_date, rate_to_usd) values
    ('USD', date '2000-01-01', 1.00000000),
    ('GBP', date '2000-01-01', 1.27000000),
    ('EUR', date '2000-01-01', 1.08000000),
    ('INR', date '2000-01-01', 0.01200000),
    ('SGD', date '2000-01-01', 0.74000000),
    ('BRL', date '2000-01-01', 0.19000000);
