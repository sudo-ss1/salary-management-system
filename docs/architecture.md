# Payscope — architecture

Diagrams use Mermaid, which GitHub renders inline. The decisions behind them live in
[`docs/adr/`](adr/); this document shows the shapes, and links to the reasoning rather than
repeating it.

---

## 1. Containers

```mermaid
flowchart LR
    HR["HR Manager<br/><i>non-technical</i>"]

    subgraph compose["docker compose up --build"]
        WEB["<b>web</b><br/>nginx<br/>Angular 20 static build<br/>SPA fallback + /api proxy"]
        API["<b>api</b><br/>Spring Boot 3.3<br/>Java 21"]
        DB[("<b>db</b><br/>PostgreSQL 16")]
    end

    HR -->|"HTTPS"| WEB
    WEB -->|"/api/* proxied<br/>same origin"| API
    API -->|"JDBC"| DB

    style HR fill:#fff,stroke:#555
    style DB fill:#e8f0fe,stroke:#4285f4
```

The browser only ever talks to one origin. `proxy.conf.json` handles this in development; nginx
handles it in the composed stack. They are separate mechanisms for the same property, which is
why the composed path has to be verified separately — a dev-mode check will not catch a broken
production proxy.

The database publishes **no host port**. `api` reaches it by service name, and publishing 5432
made `docker compose up` fail on any machine already running PostgreSQL.

---

## 2. Data model

```mermaid
erDiagram
    COUNTRY ||--o{ EMPLOYEE : "denominates pay in"
    COUNTRY ||--o{ PAY_BAND : "scopes"
    COUNTRY {
        varchar country_code PK
        varchar currency_code
    }
    EMPLOYEE ||--|| SALARY : "has exactly one current"
    EMPLOYEE ||--o{ SALARY_HISTORY : "has many superseded"
    EMPLOYEE {
        bigserial id PK
        varchar employee_number UK
        varchar email UK
        varchar country_code FK
        varchar job_role
        varchar job_level
        varchar status
        timestamptz deleted_at "null = live"
        bigint version "optimistic lock"
    }
    SALARY {
        bigserial id PK
        bigint employee_id FK
        numeric amount_original
        varchar currency_code
        numeric amount_base_usd "frozen at write time"
        date effective_from
        bigint version "optimistic lock"
    }
    SALARY_HISTORY {
        bigserial id PK
        bigint employee_id FK
        numeric amount_original
        numeric amount_base_usd "rate frozen on the row"
        date effective_from
        date effective_to
    }
    PAY_BAND {
        bigserial id PK
        varchar country_code FK
        varchar job_role
        varchar job_level
        numeric band_min
        numeric band_mid
        numeric band_max
    }
    FX_RATE {
        varchar currency_code
        date rate_date
        numeric rate_to_usd
    }
```

Four decisions are visible in that shape:

- **`amount_base_usd` is stored, not computed on read** — the rate is frozen on the row at write
  time, so a historical figure never moves when rates change ([ADR-0001](adr/0001-usd-base-currency-converted-at-write-time.md)).
- **Current salary and history are separate tables.** One current row per employee keeps every
  analytics query free of "latest row per group" gymnastics; history is append-only
  ([ADR-0004](adr/0004-current-salary-table-with-separate-history.md)).
- **`deleted_at` is distinct from `status`.** Deactivated is an employment fact; deleted is a
  record fact. Unique indexes are partial (`WHERE deleted_at IS NULL`) so a deleted employee's
  email can be reused ([ADR-0005](adr/0005-soft-delete-distinct-from-employment-status.md)).
- **Pay bands are keyed `(role, level, country)` in local currency**, which makes compa-ratio
  dimensionless and FX-free — the one figure that compares fairly across countries
  ([ADR-0002](adr/0002-pay-bands-per-role-level-country.md)).

---

## 3. The write path, and why a 409 is never retried

```mermaid
sequenceDiagram
    actor HR
    participant UI as Angular
    participant API as Spring Boot
    participant DB as PostgreSQL

    HR->>UI: edit, Save
    UI->>API: PUT /employees/7 { …, employeeVersion: 3 }
    API->>DB: UPDATE … WHERE id=7 AND version=3

    alt version still 3
        DB-->>API: 1 row
        API-->>UI: 200 + employeeVersion 4
        UI-->>HR: "Changes saved"
    else someone else wrote first
        DB-->>API: 0 rows
        API-->>UI: 409 conflictKind STALE_VERSION
        UI-->>HR: reload prompt — never an automatic retry
    else duplicate email
        DB-->>API: unique violation
        API-->>UI: 409 conflictKind UNIQUE_CONSTRAINT
        UI-->>HR: "That email address is already in use"
    end
```

**Both branches are 409 and they need opposite treatment.** Retrying a stale version with a fresh
token re-creates exactly the lost update the version exists to prevent; a uniqueness violation
just needs its message shown. The client could not originally tell them apart, so a duplicate
email produced no feedback at all — the server now labels each with `conflictKind`
([ADR-0007](adr/0007-optimistic-locking-as-concurrency-and-idempotency-mechanism.md)).

`employeeVersion` and `salaryVersion` are separate tokens and never interchangeable. Deactivate
sends **no** version — it is a transition to a fixed target state, not a read-modify-write, so
there is no lost update to guard against.

---

## 4. The analytical path — all aggregation in SQL

```mermaid
flowchart TD
    Q["“What do we pay a senior engineer<br/>in India versus the UK?”"]
    Q --> EP["GET /analytics/distribution?groupBy=COUNTRY&groupBy=LEVEL"]
    EP --> SQL["<b>One SQL statement</b><br/>percentile_cont p25/p50/p75/p90<br/>mean, headcount, median compa-ratio<br/>GROUP BY the requested dimensions"]
    SQL --> DTO["Money as strings<br/>compa-ratio as a scaled string"]
    DTO --> CHART["Chart consumes precomputed scalars"]
    CHART --> READ["Bar length = Number(amount)<br/><i>pixels only</i>"]
    CHART --> LABEL["Every label formatted<br/>from the original string"]

    style SQL fill:#e8f0fe,stroke:#4285f4
    style READ fill:#fff4e5,stroke:#f59e0b
```

**No statistic is ever computed in the browser** ([ADR-0006](adr/0006-ngx-charts-fed-precomputed-aggregates.md)).
Percentiles use `percentile_cont`, which PostgreSQL defines only over `double precision` — a
deliberate, bounded exception to the money rule, recorded rather than hidden
([ADR-0003](adr/0003-percentile-cont-for-all-percentiles.md),
[ADR-0008](adr/0008-accepting-a-double-precision-step-inside-percentile-cont.md)).

The single amber box is the only place a money amount becomes a number: an SVG bar's length must
be numeric. It drives geometry and never a label, and a test asserts that.

---

## 5. Client state

```mermaid
flowchart LR
    URL["URL<br/><i>source of truth</i>"] <--> STORE
    STORE["Signal stores<br/>EmployeeListStore<br/>EmployeeDetailStore<br/>InsightsStore"]
    STORE -->|"toObservable + switchMap"| HTTP["HttpClient"]
    HTTP -->|"toSignal"| STORE
    STORE --> VIEW["OnPush components<br/>read signals directly"]

    style URL fill:#e8f0fe,stroke:#4285f4
```

State lives in signals; **RxJS appears only at the HTTP boundary, where cancellation does real
work.** Typing "John" quickly can let the response for "Jo" resolve last and repaint the table
with results the user has already left — `switchMap` closes that.

Four such races were found and fixed during the build: the list search, the detail load, the
salary-history fetch, and a late *write* response repainting a different employee's page. The
write case takes the opposite remedy: the request is **not** cancelled, because the server has
already applied it — only the state update is guarded, on the still-active employee id.

The app runs **zoneless**, verified by rendering rather than assumed
([ADR-0009](adr/0009-zoneless-angular.md)).
