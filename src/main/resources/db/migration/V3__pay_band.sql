create table pay_band (
    id            bigserial     primary key,
    job_role      varchar(40)   not null,
    job_level     varchar(20)   not null,
    country_code  varchar(2)       not null references country (country_code),
    currency_code varchar(3)       not null,
    band_min      numeric(19,4) not null,
    band_mid      numeric(19,4) not null,
    band_max      numeric(19,4) not null,

    constraint pay_band_unique unique (job_role, job_level, country_code),
    constraint pay_band_ordered check (band_min <= band_mid and band_mid <= band_max)
);

-- Bands are derived, not hand-written: a USD base per role, a level multiplier,
-- and a country factor, converted into the country's own currency. Keyed on
-- country because a global midpoint would make compa-ratio a geography
-- detector rather than a fairness measure - see ADR-0002.
with role_base (job_role, base_usd) as (values
        ('SOFTWARE_ENGINEER',  110000),
        ('DATA_ENGINEER',      115000),
        ('PRODUCT_MANAGER',    125000),
        ('DESIGNER',            95000),
        ('ACCOUNT_EXECUTIVE',  100000),
        ('MARKETING_MANAGER',   90000),
        ('ACCOUNTANT',          80000),
        ('RECRUITER',           75000),
        ('SUPPORT_SPECIALIST',  60000)
     ),
     level_multiplier (job_level, multiplier) as (values
        ('JUNIOR', 0.65), ('MID', 1.00), ('SENIOR', 1.35), ('STAFF', 1.70), ('PRINCIPAL', 2.10)
     ),
     country_factor (country_code, factor) as (values
        ('US', 1.00), ('GB', 0.85), ('IN', 0.30), ('DE', 0.80), ('SG', 0.75), ('BR', 0.35)
     )
insert into pay_band (job_role, job_level, country_code, currency_code, band_min, band_mid, band_max)
select rb.job_role,
       lm.job_level,
       c.country_code,
       c.currency_code,
       round((rb.base_usd * lm.multiplier * cf.factor * 0.80) / fx.rate_to_usd, 2),
       round((rb.base_usd * lm.multiplier * cf.factor)        / fx.rate_to_usd, 2),
       round((rb.base_usd * lm.multiplier * cf.factor * 1.25) / fx.rate_to_usd, 2)
from role_base rb
cross join level_multiplier lm
cross join country_factor cf
join country c on c.country_code = cf.country_code
join fx_rate fx on fx.currency_code = c.currency_code and fx.rate_date = date '2026-01-01'
-- These roles have no principal grade in this organization. The gap is
-- deliberate: it makes summary.unbandedCount a real figure rather than always zero.
where not (lm.job_level = 'PRINCIPAL'
           and rb.job_role in ('RECRUITER', 'SUPPORT_SPECIALIST', 'ACCOUNTANT'));

create index pay_band_lookup on pay_band (job_role, job_level, country_code);
