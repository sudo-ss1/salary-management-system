create table employee (
    id              bigserial    primary key,
    employee_number varchar(20)  not null,
    full_name       varchar(150) not null,
    email           varchar(255) not null,
    department      varchar(30)  not null,
    country_code    varchar(2)      not null references country (country_code),
    job_role        varchar(40)  not null,
    job_level       varchar(20)  not null,
    employment_type varchar(20)  not null,
    hire_date       date         not null,
    status          varchar(10)  not null,
    deleted_at      timestamptz,
    version         bigint       not null default 0,
    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now(),

    constraint employee_department_valid check (department in
        ('ENGINEERING','PRODUCT','DESIGN','SALES','MARKETING','FINANCE','PEOPLE','SUPPORT')),
    constraint employee_role_valid check (job_role in
        ('SOFTWARE_ENGINEER','DATA_ENGINEER','PRODUCT_MANAGER','DESIGNER','ACCOUNT_EXECUTIVE',
         'MARKETING_MANAGER','ACCOUNTANT','RECRUITER','SUPPORT_SPECIALIST')),
    constraint employee_level_valid check (job_level in
        ('JUNIOR','MID','SENIOR','STAFF','PRINCIPAL')),
    constraint employee_employment_type_valid check (employment_type in
        ('FULL_TIME','PART_TIME','CONTRACT')),
    constraint employee_status_valid check (status in ('ACTIVE','INACTIVE'))
);

-- Partial, so a soft-deleted person's email and number are freed for reuse.
-- A plain unique index would burn them permanently - see ADR-0005.
create unique index employee_email_unique
    on employee (lower(email)) where deleted_at is null;

create unique index employee_number_unique
    on employee (employee_number) where deleted_at is null;

-- Serves the list endpoint's filter combination.
create index employee_list_filter
    on employee (status, country_code, department, job_level) where deleted_at is null;

-- Serves the default sort: full_name ASC, id ASC.
create index employee_default_sort
    on employee (full_name, id) where deleted_at is null;
