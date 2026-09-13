create table country (
    country_code  varchar(2)   primary key,
    name          varchar(100) not null,
    currency_code varchar(3)   not null
);

create table fx_rate (
    currency_code varchar(3)    not null,
    rate_date     date          not null,
    rate_to_usd   numeric(18,8) not null,
    primary key (currency_code, rate_date),
    constraint fx_rate_is_positive check (rate_to_usd > 0)
);

insert into country (country_code, name, currency_code) values
    ('US', 'United States',  'USD'),
    ('GB', 'United Kingdom', 'GBP'),
    ('IN', 'India',          'INR'),
    ('DE', 'Germany',        'EUR'),
    ('SG', 'Singapore',      'SGD'),
    ('BR', 'Brazil',         'BRL');

-- Fixed, dated rates. requirements.md section 4 excludes live feeds so that
-- analytics stay deterministic and a graded demo needs no third-party API.
insert into fx_rate (currency_code, rate_date, rate_to_usd) values
    ('USD', date '2026-01-01', 1.00000000),
    ('GBP', date '2026-01-01', 1.27000000),
    ('EUR', date '2026-01-01', 1.08000000),
    ('INR', date '2026-01-01', 0.01200000),
    ('SGD', date '2026-01-01', 0.74000000),
    ('BRL', date '2026-01-01', 0.19000000);
