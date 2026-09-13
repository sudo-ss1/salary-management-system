create table salary (
    id              bigserial     primary key,
    employee_id     bigint        not null references employee (id),
    amount_original numeric(19,4) not null,
    currency_code   varchar(3)    not null,
    amount_base_usd numeric(19,4) not null,
    fx_rate         numeric(18,8) not null,
    fx_rate_date    date          not null,
    effective_from  date          not null,
    version         bigint        not null default 0,
    created_at      timestamptz   not null default now(),

    -- Exactly one current salary per employee, guaranteed by the database
    -- rather than by service-layer discipline.
    constraint salary_one_per_employee unique (employee_id),
    constraint salary_amount_positive check (amount_original > 0),
    constraint salary_base_positive check (amount_base_usd > 0)
);

create index salary_base_amount on salary (amount_base_usd);

create table salary_history (
    id              bigserial     primary key,
    employee_id     bigint        not null references employee (id),
    amount_original numeric(19,4) not null,
    currency_code   varchar(3)    not null,
    amount_base_usd numeric(19,4) not null,
    fx_rate         numeric(18,8) not null,
    fx_rate_date    date          not null,
    effective_from  date          not null,
    effective_to    date          not null,
    change_reason   varchar(200),
    recorded_at     timestamptz   not null default now(),

    constraint salary_history_period_ordered check (effective_to >= effective_from)
);

create index salary_history_by_employee on salary_history (employee_id, effective_to desc);
