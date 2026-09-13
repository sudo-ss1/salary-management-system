# Payscope Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Payscope backend — employee and salary records for a ~10,000-person multi-country organization, plus SQL-computed pay insights — behind a REST API.

**Architecture:** Spring Boot with package-by-feature layout (`employee/`, `salary/`, `analytics/`, `currency/`, `common/`, `seed/`). Controllers stay thin; business logic lives in services and domain objects. All aggregation is SQL. Read-heavy list and analytics endpoints bypass JPA entities entirely and use flat projection queries, so query count is constant in page size.

**Tech Stack:** Java 21, Spring Boot 3.x, Spring Data JPA, Flyway, PostgreSQL 16, JUnit 5, AssertJ, Mockito, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-12-payscope-design.md` — read it alongside this plan. Every task argues from a numbered spec section.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Java 21, Spring Boot 3.x, PostgreSQL 16.** No in-memory database anywhere, including tests.
- **Money is `BigDecimal`, never `double`/`float`.** Amounts move through `common.Money` with an explicit currency.
- **Never aggregate across mixed currencies.** Org-wide aggregation runs on `amount_base_usd` only.
- **Aggregation happens in SQL, not Java.** No loading rows into memory to compute a median, percentile, total or group statistic.
- **Pagination, filtering and sorting are server-side.** Page size caps at 100; `size` outside 1–100 returns 400. Default sort is `fullName ASC, id ASC` — the `id` tiebreaker is mandatory.
- **All percentiles use `percentile_cont`**, including `medianCompaRatio`.
- **Optimistic-lock tokens are `employeeVersion` and `salaryVersion`** — never a bare `version`. Required on `PUT /employees/{id}` and `POST /employees/{id}/salary`; never on `DELETE` or `deactivate`.
- **Money on the wire is a string:** `{"amount":"125000.00","currency":"INR"}`.
- **`spring.jpa.open-in-view=false`.** Non-negotiable.
- **Add no dependencies** beyond those in Task 1's `pom.xml` without asking.
- **A `Clock` bean is injected everywhere.** Never `LocalDate.now()` or `Instant.now()` in a service.
- **TDD, three commits per behaviour:** the failing test, the implementation, and any refactor. One feature per commit. Never batch features.
- **Commit locally. Never push.** No remotes, ever.
- **No AI attribution in commit messages.** No `Co-authored-by`, no generation trailers, no emoji.
- **Schema changes are new Flyway migrations.** Never edit an applied one.
- **Exchange rates are seeded at a historical baseline as well as the current date.**
  `V1` seeds each currency at 2026-01-01; `V5` seeds the same six currencies at
  2000-01-01. Salaries are routinely effective from a past hire date, and a converter
  that finds no rate on or before that date fails the write. See the Task 8 ruling.
- **Code columns are `varchar(n)`, never `char(n)`.** PostgreSQL blank-pads `char`,
  which forces `@JdbcTypeCode(SqlTypes.CHAR)` on every mapped field and a `.trim()` on
  every native-query read. See the Task 3 ruling in the SDD ledger.

### Pinned enumerations

The spec left these open. They are fixed here; change them only by amending this section.

**Countries and currencies** (6): `US`/USD, `GB`/GBP, `IN`/INR, `DE`/EUR, `SG`/SGD, `BR`/BRL.

**FX rates to USD**, all dated `2026-01-01`:
`USD 1.00000000`, `GBP 1.27000000`, `EUR 1.08000000`, `INR 0.01200000`, `SGD 0.74000000`, `BRL 0.19000000`.

**Department** (8): `ENGINEERING`, `PRODUCT`, `DESIGN`, `SALES`, `MARKETING`, `FINANCE`, `PEOPLE`, `SUPPORT`.

**Role** (9): `SOFTWARE_ENGINEER`, `DATA_ENGINEER`, `PRODUCT_MANAGER`, `DESIGNER`, `ACCOUNT_EXECUTIVE`, `MARKETING_MANAGER`, `ACCOUNTANT`, `RECRUITER`, `SUPPORT_SPECIALIST`.

**Level** (5): `JUNIOR`, `MID`, `SENIOR`, `STAFF`, `PRINCIPAL`.

**EmploymentType** (3): `FULL_TIME`, `PART_TIME`, `CONTRACT`.

**EmployeeStatus** (2): `ACTIVE`, `INACTIVE`.

---

## File Structure

```
pom.xml
Dockerfile
docker-compose.yml
README.md
src/main/resources/
  application.yml
  application-dev.yml
  db/migration/
    V1__country_and_fx_rate.sql
    V2__employee.sql
    V3__pay_band.sql
    V4__salary_and_history.sql
src/main/java/com/payscope/
  PayscopeApplication.java
  common/
    Money.java                     value object: BigDecimal + Currency
    MoneyDto.java                  wire form: amount as a string
    ClockConfig.java               Clock bean
    DomainException.java           rule violation -> 400
    NotFoundException.java         -> 404
    StaleVersionException.java     -> 409, carries currentVersion
    ApiExceptionHandler.java       @RestControllerAdvice -> ProblemDetail
    PagedResponse.java             project-owned page DTO
  currency/
    Country.java  CountryRepository.java
    FxRate.java   FxRateId.java  FxRateRepository.java
    CurrencyConverter.java         Money -> USD using a dated rate
    ConversionResult.java          converted amount + rate + rate date
  employee/
    Employee.java  Department.java Role.java Level.java EmploymentType.java EmployeeStatus.java
    EmployeeRepository.java
    EmployeeListRepository.java    native projection query (list endpoint)
    EmployeeQuery.java  EmployeeSort.java
    EmployeeService.java
    EmployeeController.java
    dto/ CreateEmployeeRequest.java UpdateEmployeeRequest.java
         EmployeeDetailResponse.java EmployeeListItem.java
  salary/
    Salary.java  SalaryHistory.java
    SalaryRepository.java SalaryHistoryRepository.java
    PayBand.java PayBandRepository.java
    CompaRatio.java                pure calculation
    SalaryService.java
    SalaryController.java
    dto/ RecordSalaryRequest.java SalaryResponse.java SalaryHistoryItem.java
  analytics/
    AnalyticsFilter.java  GroupByDimension.java
    AnalyticsRepository.java       all aggregate SQL
    AnalyticsService.java
    AnalyticsController.java
    dto/ SummaryResponse.java DistributionGroup.java OutlierItem.java CompaRatioBucket.java
  seed/
    SeedProperties.java
    SeedRunner.java
    EmployeeGenerator.java
src/test/java/com/payscope/
  support/
    ContainerConfig.java           singleton Postgres via @ServiceConnection
    IntegrationTest.java           @SpringBootTest meta-annotation
    FixedClockConfig.java          Clock.fixed for date-dependent rules
    DatabaseCleaner.java           truncation for count-sensitive tests
    QueryCounter.java              Hibernate Statistics helper
    Fixtures.java                  the fixed 12-employee analytics dataset
  ...mirrors main packages
```

---

### Task 1: Project skeleton, real Postgres, and the test harness

Nothing can be tested until a container starts and Flyway runs. This task folds in build config, profiles, the `Clock` bean and the Testcontainers harness, because none of them is independently reviewable.

**Files:**
- Create: `pom.xml`, `docker-compose.yml`, `.mvn/wrapper/` (via `mvn wrapper:wrapper`)
- Create: `src/main/resources/application.yml`, `src/main/resources/application-dev.yml`
- Create: `src/main/java/com/payscope/PayscopeApplication.java`
- Create: `src/main/java/com/payscope/common/ClockConfig.java`
- Create: `src/test/resources/application-test.yml`
- Create: `src/test/java/com/payscope/support/ContainerConfig.java`
- Create: `src/test/java/com/payscope/support/IntegrationTest.java`
- Test: `src/test/java/com/payscope/PayscopeApplicationTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `@IntegrationTest` meta-annotation for every later integration test; a `Clock` bean injectable everywhere; Maven coordinates that later tasks must not extend.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/PayscopeApplicationTest.java`
```java
package com.payscope;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class PayscopeApplicationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void starts_against_a_real_postgres_and_runs_flyway() {
        String version = jdbc.queryForObject("select version()", String.class);
        assertThat(version).contains("PostgreSQL");

        Integer historyTables = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'flyway_schema_history'",
                Integer.class);
        assertThat(historyTables).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=PayscopeApplicationTest`
Expected: FAIL — the project does not compile yet (no `pom.xml`, no `IntegrationTest` annotation).

- [ ] **Step 3: Write minimal implementation**

`pom.xml` — this is the complete dependency set for the backend. Do not add to it without asking.
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>
  <groupId>com.payscope</groupId>
  <artifactId>payscope</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-testcontainers</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>postgresql</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

`src/main/java/com/payscope/PayscopeApplication.java`
```java
package com.payscope;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PayscopeApplication {
    public static void main(String[] args) {
        SpringApplication.run(PayscopeApplication.class, args);
    }
}
```

`src/main/java/com/payscope/common/ClockConfig.java`
```java
package com.payscope.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    /**
     * Injected everywhere a date or timestamp is needed. Services must never call
     * LocalDate.now() or Instant.now() directly - tests replace this with Clock.fixed.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
```

`src/main/resources/application.yml`
```yaml
spring:
  application:
    name: payscope
  datasource:
    url: jdbc:postgresql://localhost:5432/payscope?reWriteBatchedInserts=true
    username: payscope
    password: payscope
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        default_batch_fetch_size: 100
        jdbc:
          batch_size: 1000
          time_zone: UTC
  flyway:
    enabled: true

payscope:
  seed:
    enabled: false

server:
  error:
    include-stacktrace: never
```

`src/main/resources/application-dev.yml`
```yaml
payscope:
  seed:
    enabled: true
```

`src/test/resources/application-test.yml`
```yaml
spring:
  jpa:
    properties:
      hibernate:
        generate_statistics: true
payscope:
  seed:
    enabled: false
```

`src/test/java/com/payscope/support/ContainerConfig.java`
```java
package com.payscope.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

@TestConfiguration(proxyBeanMethods = false)
public class ContainerConfig {

    /**
     * One container per Spring test context. Because the context is cached across
     * test classes, the whole suite shares a single Postgres and Flyway runs once.
     * reWriteBatchedInserts matches production so batch behaviour is tested, not assumed.
     */
    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>("postgres:16-alpine")
                .withUrlParam("reWriteBatchedInserts", "true");
    }
}
```

`src/test/java/com/payscope/support/IntegrationTest.java`
```java
package com.payscope.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@Import(ContainerConfig.class)
@ActiveProfiles("test")
public @interface IntegrationTest {
}
```

`docker-compose.yml`
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: payscope
      POSTGRES_USER: payscope
      POSTGRES_PASSWORD: payscope
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U payscope"]
      interval: 2s
      timeout: 3s
      retries: 20
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=PayscopeApplicationTest`
Expected: PASS. Docker must be running.

- [ ] **Step 5: Commit**

```bash
git add pom.xml docker-compose.yml .mvn mvnw mvnw.cmd src
git commit -m "chore: scaffold Spring Boot project with Postgres test harness

Testcontainers Postgres shared across the suite via @ServiceConnection.
H2 is not used anywhere: the design depends on percentile_cont, partial
unique indexes and SELECT FOR SHARE, none of which H2 reproduces."
```

---

### Task 2: `Money` value object

Pure domain, no Spring, no database. Everything downstream depends on its rounding rules.

**Files:**
- Create: `src/main/java/com/payscope/common/Money.java`
- Test: `src/test/java/com/payscope/common/MoneyTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Money.of(BigDecimal amount, Currency currency)` → `Money`
  - `Money.of(String amount, String currencyCode)` → `Money`
  - `money.amount()` → `BigDecimal`, `money.currency()` → `Currency`, `money.currencyCode()` → `String`
  - `money.plus(Money)` → `Money` (throws `IllegalArgumentException` on currency mismatch)
  - `money.multiply(BigDecimal factor)` → `Money`
  - `money.ratioTo(Money other)` → `BigDecimal`, scale 4, HALF_UP (throws on currency mismatch)
  - `money.isPositive()` → `boolean`

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/common/MoneyTest.java`
```java
package com.payscope.common;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Currency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {

    @Test
    void rounds_to_the_currencys_minor_units_on_construction() {
        assertThat(Money.of("100.005", "USD").amount()).isEqualByComparingTo("100.01");
    }

    @Test
    void rounds_to_zero_decimal_places_for_a_currency_with_no_minor_units() {
        assertThat(Money.of("1000.60", "JPY").amount()).isEqualByComparingTo("1001");
    }

    @Test
    void rounds_half_up_rather_than_half_even() {
        assertThat(Money.of("2.345", "USD").amount()).isEqualByComparingTo("2.35");
        assertThat(Money.of("2.355", "USD").amount()).isEqualByComparingTo("2.36");
    }

    @Test
    void adds_two_amounts_in_the_same_currency() {
        Money sum = Money.of("100.00", "GBP").plus(Money.of("0.50", "GBP"));
        assertThat(sum.amount()).isEqualByComparingTo("100.50");
        assertThat(sum.currencyCode()).isEqualTo("GBP");
    }

    @Test
    void refuses_to_add_amounts_in_different_currencies() {
        assertThatThrownBy(() -> Money.of("100.00", "GBP").plus(Money.of("100.00", "USD")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("GBP")
                .hasMessageContaining("USD");
    }

    @Test
    void multiplies_by_a_factor_and_rounds_the_result() {
        Money converted = Money.of("1000.00", "USD").multiply(new BigDecimal("0.012345"));
        assertThat(converted.amount()).isEqualByComparingTo("12.35");
    }

    @Test
    void expresses_a_ratio_against_another_amount_to_four_decimal_places() {
        BigDecimal ratio = Money.of("90000.00", "USD").ratioTo(Money.of("100000.00", "USD"));
        assertThat(ratio).isEqualByComparingTo("0.9000");
    }

    @Test
    void rounds_a_recurring_ratio_to_four_decimal_places() {
        BigDecimal ratio = Money.of("100000.00", "USD").ratioTo(Money.of("300000.00", "USD"));
        assertThat(ratio).isEqualByComparingTo("0.3333");
    }

    @Test
    void refuses_to_compare_amounts_in_different_currencies() {
        assertThatThrownBy(() -> Money.of("1.00", "INR").ratioTo(Money.of("1.00", "USD")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void equal_amounts_in_the_same_currency_are_equal_regardless_of_input_scale() {
        assertThat(Money.of("10.5", "USD")).isEqualTo(Money.of("10.50", "USD"));
        assertThat(Money.of("10.5", "USD")).hasSameHashCodeAs(Money.of("10.50", "USD"));
    }

    @Test
    void amounts_in_different_currencies_are_never_equal() {
        assertThat(Money.of("10.00", "USD")).isNotEqualTo(Money.of("10.00", "SGD"));
    }

    @Test
    void reports_whether_the_amount_is_strictly_positive() {
        assertThat(Money.of("0.01", "USD").isPositive()).isTrue();
        assertThat(Money.of("0.00", "USD").isPositive()).isFalse();
        assertThat(Money.of("-1.00", "USD").isPositive()).isFalse();
    }

    @Test
    void rejects_a_null_amount_or_currency() {
        assertThatThrownBy(() -> Money.of((BigDecimal) null, Currency.getInstance("USD")))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> Money.of(new BigDecimal("1.00"), null))
                .isInstanceOf(NullPointerException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=MoneyTest`
Expected: FAIL — `Money` does not exist, compilation error.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/common/Money.java`
```java
package com.payscope.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;

/**
 * An amount with an explicit currency. Amounts are rounded HALF_UP to the
 * currency's own minor units on construction - JPY has none, USD has two.
 *
 * Money is the domain type. Entities persist a BigDecimal column plus a
 * currency_code column and expose a Money accessor; Money itself is not a
 * JPA embeddable, so it stays immutable and free of a no-arg constructor.
 */
public final class Money implements Comparable<Money> {

    private static final int RATIO_SCALE = 4;

    private final BigDecimal amount;
    private final Currency currency;

    private Money(BigDecimal amount, Currency currency) {
        this.amount = amount;
        this.currency = currency;
    }

    public static Money of(BigDecimal amount, Currency currency) {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        return new Money(amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.HALF_UP), currency);
    }

    public static Money of(String amount, String currencyCode) {
        return of(new BigDecimal(amount), Currency.getInstance(currencyCode));
    }

    public BigDecimal amount() {
        return amount;
    }

    public Currency currency() {
        return currency;
    }

    public String currencyCode() {
        return currency.getCurrencyCode();
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return of(amount.add(other.amount), currency);
    }

    public Money multiply(BigDecimal factor) {
        Objects.requireNonNull(factor, "factor");
        return of(amount.multiply(factor), currency);
    }

    /**
     * This amount as a proportion of another. Both sides must share a currency,
     * which is what makes compa-ratio free of any exchange rate.
     */
    public BigDecimal ratioTo(Money other) {
        requireSameCurrency(other);
        return amount.divide(other.amount, RATIO_SCALE, RoundingMode.HALF_UP);
    }

    public boolean isPositive() {
        return amount.signum() > 0;
    }

    private void requireSameCurrency(Money other) {
        Objects.requireNonNull(other, "other");
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException(
                    "Cannot combine " + currencyCode() + " with " + other.currencyCode()
                            + ": amounts in different currencies are never comparable");
        }
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return amount.compareTo(other.amount);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Money other)) return false;
        return currency.equals(other.currency) && amount.compareTo(other.amount) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(amount.stripTrailingZeros(), currency);
    }

    @Override
    public String toString() {
        return amount.toPlainString() + " " + currencyCode();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=MoneyTest`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/common/Money.java src/test/java/com/payscope/common/MoneyTest.java
git commit -m "feat: add Money value object with per-currency rounding

Amounts round HALF_UP to the currency's own minor units. ratioTo requires
a shared currency, which is what keeps compa-ratio free of exchange rates."
```

---

### Task 3: Currency reference data and conversion to USD

Implements spec §3 (`country`, `fx_rate`) and ADR-0001. Conversion happens at write time and the rate used is returned so callers can persist it.

**Files:**
- Create: `src/main/resources/db/migration/V1__country_and_fx_rate.sql`
- Create: `src/main/java/com/payscope/common/DomainException.java`
- Create: `src/main/java/com/payscope/currency/Country.java`, `CountryRepository.java`
- Create: `src/main/java/com/payscope/currency/FxRate.java`, `FxRateId.java`, `FxRateRepository.java`
- Create: `src/main/java/com/payscope/currency/CurrencyConverter.java`, `ConversionResult.java`
- Test: `src/test/java/com/payscope/currency/CurrencyConverterTest.java`

**Interfaces:**
- Consumes: `Money` (Task 2), `@IntegrationTest` (Task 1).
- Produces:
  - `DomainException(String message)` — base for rule violations mapped to HTTP 400 in Task 8.
  - `CountryRepository.findById(String countryCode)` → `Optional<Country>`; `country.currencyCode()` → `String`.
  - `CurrencyConverter.toUsd(Money original, LocalDate asOf)` → `ConversionResult`.
  - `ConversionResult` is a record: `Money baseUsd`, `BigDecimal rate`, `LocalDate rateDate`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/currency/CurrencyConverterTest.java`
```java
package com.payscope.currency;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
@Transactional
class CurrencyConverterTest {

    private static final LocalDate ASOF = LocalDate.of(2026, 6, 1);

    @Autowired
    CurrencyConverter converter;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void converts_rupees_to_dollars_at_the_seeded_rate() {
        ConversionResult result = converter.toUsd(Money.of("1000000.00", "INR"), ASOF);

        assertThat(result.baseUsd().amount()).isEqualByComparingTo("12000.00");
        assertThat(result.baseUsd().currencyCode()).isEqualTo("USD");
        assertThat(result.rate()).isEqualByComparingTo("0.01200000");
        assertThat(result.rateDate()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    void converts_pounds_to_dollars_at_the_seeded_rate() {
        ConversionResult result = converter.toUsd(Money.of("80000.00", "GBP"), ASOF);

        assertThat(result.baseUsd().amount()).isEqualByComparingTo("101600.00");
    }

    @Test
    void rounds_the_converted_amount_to_two_decimal_places() {
        ConversionResult result = converter.toUsd(Money.of("1234.56", "SGD"), ASOF);

        // 1234.56 * 0.74 = 913.5744
        assertThat(result.baseUsd().amount()).isEqualByComparingTo("913.57");
    }

    @Test
    void passes_dollars_through_at_a_rate_of_one() {
        ConversionResult result = converter.toUsd(Money.of("50000.00", "USD"), ASOF);

        assertThat(result.baseUsd().amount()).isEqualByComparingTo("50000.00");
        assertThat(result.rate()).isEqualByComparingTo("1.00000000");
    }

    @Test
    void uses_the_most_recent_rate_on_or_before_the_requested_date() {
        jdbc.update("insert into fx_rate (currency_code, rate_date, rate_to_usd) values ('GBP', ?, ?)",
                LocalDate.of(2026, 3, 1), new BigDecimal("1.30000000"));

        ConversionResult afterChange = converter.toUsd(Money.of("100.00", "GBP"), LocalDate.of(2026, 4, 1));
        ConversionResult beforeChange = converter.toUsd(Money.of("100.00", "GBP"), LocalDate.of(2026, 2, 1));

        assertThat(afterChange.rate()).isEqualByComparingTo("1.30000000");
        assertThat(afterChange.rateDate()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(beforeChange.rate()).isEqualByComparingTo("1.27000000");
        assertThat(beforeChange.rateDate()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    void refuses_to_convert_when_no_rate_exists_on_or_before_the_date() {
        assertThatThrownBy(() -> converter.toUsd(Money.of("100.00", "GBP"), LocalDate.of(1999, 12, 31)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("GBP")
                .hasMessageContaining("1999-12-31");
    }

    @Test
    void seeds_one_country_row_per_supported_country() {
        Integer countries = jdbc.queryForObject("select count(*) from country", Integer.class);
        assertThat(countries).isEqualTo(6);

        String indiaCurrency = jdbc.queryForObject(
                "select currency_code from country where country_code = 'IN'", String.class);
        assertThat(indiaCurrency).isEqualTo("INR");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=CurrencyConverterTest`
Expected: FAIL — `CurrencyConverter`, `ConversionResult` and `DomainException` do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/resources/db/migration/V1__country_and_fx_rate.sql`
```sql
create table country (
    country_code  varchar(2)      primary key,
    name          varchar(100) not null,
    currency_code varchar(3)      not null
);

create table fx_rate (
    currency_code varchar(3)       not null,
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
```

`src/main/java/com/payscope/common/DomainException.java`
```java
package com.payscope.common;

/**
 * A business rule was violated. Mapped to HTTP 400 by ApiExceptionHandler.
 * Distinct from a field-shape failure, which Bean Validation reports instead.
 */
public class DomainException extends RuntimeException {
    public DomainException(String message) {
        super(message);
    }
}
```

`src/main/java/com/payscope/currency/Country.java`
```java
package com.payscope.currency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "country")
public class Country {

    @Id
    @Column(name = "country_code")
    private String countryCode;

    private String name;

    @Column(name = "currency_code")
    private String currencyCode;

    protected Country() {
    }

    public String countryCode() {
        return countryCode;
    }

    public String name() {
        return name;
    }

    public String currencyCode() {
        return currencyCode;
    }
}
```

`src/main/java/com/payscope/currency/CountryRepository.java`
```java
package com.payscope.currency;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CountryRepository extends JpaRepository<Country, String> {
}
```

`src/main/java/com/payscope/currency/FxRateId.java`
```java
package com.payscope.currency;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

@Embeddable
public class FxRateId implements Serializable {

    private String currencyCode;
    private LocalDate rateDate;

    protected FxRateId() {
    }

    public FxRateId(String currencyCode, LocalDate rateDate) {
        this.currencyCode = currencyCode;
        this.rateDate = rateDate;
    }

    public String currencyCode() {
        return currencyCode;
    }

    public LocalDate rateDate() {
        return rateDate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FxRateId other)) return false;
        return Objects.equals(currencyCode, other.currencyCode) && Objects.equals(rateDate, other.rateDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(currencyCode, rateDate);
    }
}
```

`src/main/java/com/payscope/currency/FxRate.java`
```java
package com.payscope.currency;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "fx_rate")
public class FxRate {

    @EmbeddedId
    private FxRateId id;

    @Column(name = "rate_to_usd")
    private BigDecimal rateToUsd;

    protected FxRate() {
    }

    public String currencyCode() {
        return id.currencyCode();
    }

    public LocalDate rateDate() {
        return id.rateDate();
    }

    public BigDecimal rateToUsd() {
        return rateToUsd;
    }
}
```

`src/main/java/com/payscope/currency/FxRateRepository.java`
```java
package com.payscope.currency;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface FxRateRepository extends JpaRepository<FxRate, FxRateId> {

    /**
     * The rate in force on a given date: the most recent row on or before it.
     */
    Optional<FxRate> findFirstByIdCurrencyCodeAndIdRateDateLessThanEqualOrderByIdRateDateDesc(
            String currencyCode, LocalDate asOf);
}
```

`src/main/java/com/payscope/currency/ConversionResult.java`
```java
package com.payscope.currency;

import com.payscope.common.Money;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The converted amount plus the rate that produced it. Callers persist all three
 * onto the salary row so amount_base_usd stays reproducible - see ADR-0001.
 */
public record ConversionResult(Money baseUsd, BigDecimal rate, LocalDate rateDate) {
}
```

`src/main/java/com/payscope/currency/CurrencyConverter.java`
```java
package com.payscope.currency;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Currency;

@Component
public class CurrencyConverter {

    private static final Currency USD = Currency.getInstance("USD");

    private final FxRateRepository rates;

    public CurrencyConverter(FxRateRepository rates) {
        this.rates = rates;
    }

    /**
     * Converts to the base currency using the rate in force on asOf. Conversion
     * happens at write time and the result is persisted, so aggregates do not
     * move when rates later change (ADR-0001).
     */
    public ConversionResult toUsd(Money original, LocalDate asOf) {
        FxRate rate = rates
                .findFirstByIdCurrencyCodeAndIdRateDateLessThanEqualOrderByIdRateDateDesc(
                        original.currencyCode(), asOf)
                .orElseThrow(() -> new DomainException(
                        "No exchange rate for " + original.currencyCode() + " on or before " + asOf));

        Money converted = Money.of(original.amount().multiply(rate.rateToUsd()), USD);
        return new ConversionResult(converted, rate.rateToUsd(), rate.rateDate());
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=CurrencyConverterTest`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/resources/db/migration/V1__country_and_fx_rate.sql \
        src/main/java/com/payscope/common/DomainException.java \
        src/main/java/com/payscope/currency src/test/java/com/payscope/currency
git commit -m "feat: add currency reference data and write-time USD conversion

Rates are stored and dated rather than fetched, so analytics are
deterministic. The rate used is returned with the converted amount so
callers can persist it and keep the figure reproducible."
```

---

### Task 4: Employee schema, entity and repository

Implements spec §3 `employee` and the partial unique indexes that make ADR-0005 workable.

**Files:**
- Create: `src/main/resources/db/migration/V2__employee.sql`
- Create: `src/main/java/com/payscope/employee/Department.java`, `Role.java`, `Level.java`, `EmploymentType.java`, `EmployeeStatus.java`
- Create: `src/main/java/com/payscope/employee/Employee.java`, `EmployeeRepository.java`
- Test: `src/test/java/com/payscope/employee/EmployeeRepositoryTest.java`

**Interfaces:**
- Consumes: `Country` table (Task 3).
- Produces:
  - Enums `Department`, `Role`, `Level`, `EmploymentType`, `EmployeeStatus` with the constants pinned in Global Constraints.
  - `Employee` with accessors `id()`, `employeeNumber()`, `fullName()`, `email()`, `department()`, `countryCode()`, `role()`, `level()`, `employmentType()`, `hireDate()`, `status()`, `deletedAt()`, `version()`.
  - Mutators `rename(String)`, `changeEmail(String)`, `reassign(Department, Role, Level, EmploymentType)`, `deactivate()`, `softDelete(Instant)`.
  - `Employee.create(...)` static factory — full signature in Step 3.
  - `EmployeeRepository.findByIdAndDeletedAtIsNull(Long id)` → `Optional<Employee>`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/employee/EmployeeRepositoryTest.java`
```java
package com.payscope.employee;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
@Transactional
class EmployeeRepositoryTest {

    @Autowired
    EmployeeRepository employees;

    @Autowired
    JdbcTemplate jdbc;

    private Employee anEmployee(String number, String email) {
        return Employee.create(number, "Asha Menon", email, Department.ENGINEERING, "IN",
                Role.SOFTWARE_ENGINEER, Level.SENIOR, EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1));
    }

    @Test
    void persists_an_employee_and_reads_it_back() {
        Employee saved = employees.saveAndFlush(anEmployee("E-0001", "asha@acme.test"));

        Employee found = employees.findById(saved.id()).orElseThrow();
        assertThat(found.fullName()).isEqualTo("Asha Menon");
        assertThat(found.countryCode()).isEqualTo("IN");
        assertThat(found.level()).isEqualTo(Level.SENIOR);
        assertThat(found.status()).isEqualTo(EmployeeStatus.ACTIVE);
        assertThat(found.deletedAt()).isNull();
    }

    @Test
    void starts_every_employee_at_version_zero() {
        Employee saved = employees.saveAndFlush(anEmployee("E-0002", "v0@acme.test"));

        assertThat(saved.version()).isZero();
    }

    @Test
    void rejects_a_second_active_employee_with_the_same_email() {
        employees.saveAndFlush(anEmployee("E-0003", "clash@acme.test"));

        assertThatThrownBy(() -> employees.saveAndFlush(anEmployee("E-0004", "clash@acme.test")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void treats_email_uniqueness_as_case_insensitive() {
        employees.saveAndFlush(anEmployee("E-0005", "Case@acme.test"));

        assertThatThrownBy(() -> employees.saveAndFlush(anEmployee("E-0006", "case@acme.test")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void frees_an_email_for_reuse_once_the_original_employee_is_soft_deleted() {
        Employee first = employees.saveAndFlush(anEmployee("E-0007", "reuse@acme.test"));
        first.softDelete(Instant.parse("2026-09-12T10:00:00Z"));
        employees.saveAndFlush(first);

        Employee replacement = employees.saveAndFlush(anEmployee("E-0008", "reuse@acme.test"));

        assertThat(replacement.id()).isNotEqualTo(first.id());
    }

    @Test
    void hides_soft_deleted_employees_from_the_undeleted_lookup() {
        Employee employee = employees.saveAndFlush(anEmployee("E-0009", "gone@acme.test"));
        employee.softDelete(Instant.parse("2026-09-12T10:00:00Z"));
        employees.saveAndFlush(employee);

        Optional<Employee> found = employees.findByIdAndDeletedAtIsNull(employee.id());

        assertThat(found).isEmpty();
    }

    @Test
    void keeps_deactivation_separate_from_deletion() {
        Employee employee = employees.saveAndFlush(anEmployee("E-0010", "leaver@acme.test"));
        employee.deactivate();
        employees.saveAndFlush(employee);

        Employee found = employees.findByIdAndDeletedAtIsNull(employee.id()).orElseThrow();
        assertThat(found.status()).isEqualTo(EmployeeStatus.INACTIVE);
        assertThat(found.deletedAt()).isNull();
    }

    @Test
    void rejects_a_department_outside_the_permitted_set() {
        assertThatThrownBy(() -> jdbc.update("""
                insert into employee (employee_number, full_name, email, department, country_code,
                                      job_role, job_level, employment_type, hire_date, status, version)
                values ('E-9999', 'Bad Row', 'bad@acme.test', 'ACCOUNTING', 'IN',
                        'SOFTWARE_ENGINEER', 'SENIOR', 'FULL_TIME', date '2024-01-01', 'ACTIVE', 0)
                """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejects_an_employee_in_a_country_that_does_not_exist() {
        assertThatThrownBy(() -> employees.saveAndFlush(
                Employee.create("E-9998", "Nowhere Person", "nowhere@acme.test", Department.SALES, "ZZ",
                        Role.ACCOUNT_EXECUTIVE, Level.MID, EmploymentType.FULL_TIME, LocalDate.of(2024, 1, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=EmployeeRepositoryTest`
Expected: FAIL — `Employee` and the enums do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/resources/db/migration/V2__employee.sql`

Note the column names `job_role` and `job_level`: `role` and `level` are Postgres keywords and, while non-reserved, reading as identifiers in every query is not worth the ambiguity.
```sql
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
```

`src/main/java/com/payscope/employee/Department.java`
```java
package com.payscope.employee;

public enum Department {
    ENGINEERING, PRODUCT, DESIGN, SALES, MARKETING, FINANCE, PEOPLE, SUPPORT
}
```

`src/main/java/com/payscope/employee/Role.java`
```java
package com.payscope.employee;

public enum Role {
    SOFTWARE_ENGINEER, DATA_ENGINEER, PRODUCT_MANAGER, DESIGNER, ACCOUNT_EXECUTIVE,
    MARKETING_MANAGER, ACCOUNTANT, RECRUITER, SUPPORT_SPECIALIST
}
```

`src/main/java/com/payscope/employee/Level.java`
```java
package com.payscope.employee;

public enum Level {
    JUNIOR, MID, SENIOR, STAFF, PRINCIPAL
}
```

`src/main/java/com/payscope/employee/EmploymentType.java`
```java
package com.payscope.employee;

public enum EmploymentType {
    FULL_TIME, PART_TIME, CONTRACT
}
```

`src/main/java/com/payscope/employee/EmployeeStatus.java`
```java
package com.payscope.employee;

public enum EmployeeStatus {
    ACTIVE, INACTIVE
}
```

`src/main/java/com/payscope/employee/Employee.java`
```java
package com.payscope.employee;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "employee")
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_number")
    private String employeeNumber;

    @Column(name = "full_name")
    private String fullName;

    private String email;

    @Enumerated(EnumType.STRING)
    private Department department;

    @Column(name = "country_code")
    private String countryCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_role")
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_level")
    private Level level;

    @Enumerated(EnumType.STRING)
    @Column(name = "employment_type")
    private EmploymentType employmentType;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Enumerated(EnumType.STRING)
    private EmployeeStatus status;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Version
    private Long version;

    protected Employee() {
    }

    public static Employee create(String employeeNumber, String fullName, String email,
                                  Department department, String countryCode, Role role, Level level,
                                  EmploymentType employmentType, LocalDate hireDate) {
        Employee employee = new Employee();
        employee.employeeNumber = employeeNumber;
        employee.fullName = fullName;
        employee.email = email;
        employee.department = department;
        employee.countryCode = countryCode;
        employee.role = role;
        employee.level = level;
        employee.employmentType = employmentType;
        employee.hireDate = hireDate;
        employee.status = EmployeeStatus.ACTIVE;
        return employee;
    }

    public void rename(String fullName) {
        this.fullName = fullName;
    }

    public void changeEmail(String email) {
        this.email = email;
    }

    public void reassign(Department department, Role role, Level level, EmploymentType employmentType) {
        this.department = department;
        this.role = role;
        this.level = level;
        this.employmentType = employmentType;
    }

    /** The person left the company. The record stays visible and countable. */
    public void deactivate() {
        this.status = EmployeeStatus.INACTIVE;
    }

    /** The record should not exist. It disappears from every read - see ADR-0005. */
    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public Long id() { return id; }
    public String employeeNumber() { return employeeNumber; }
    public String fullName() { return fullName; }
    public String email() { return email; }
    public Department department() { return department; }
    public String countryCode() { return countryCode; }
    public Role role() { return role; }
    public Level level() { return level; }
    public EmploymentType employmentType() { return employmentType; }
    public LocalDate hireDate() { return hireDate; }
    public EmployeeStatus status() { return status; }
    public Instant deletedAt() { return deletedAt; }
    public Long version() { return version; }
}
```

`src/main/java/com/payscope/employee/EmployeeRepository.java`
```java
package com.payscope.employee;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    Optional<Employee> findByIdAndDeletedAtIsNull(Long id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=EmployeeRepositoryTest`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/resources/db/migration/V2__employee.sql \
        src/main/java/com/payscope/employee src/test/java/com/payscope/employee
git commit -m "feat: add employee schema and entity

Partial unique indexes on email and employee number, so soft-deleting a
record frees both for reuse rather than burning them permanently.
Deactivation and deletion are separate columns and separate concepts."
```

---

### Task 5: Pay bands, keyed on country

Implements ADR-0002. Bands are generated in SQL from a role base, a level multiplier and a country factor rather than written out as 250+ literal rows — deterministic, auditable, and short enough to read.

**Files:**
- Create: `src/main/resources/db/migration/V3__pay_band.sql`
- Create: `src/main/java/com/payscope/salary/PayBand.java`, `PayBandRepository.java`
- Test: `src/test/java/com/payscope/salary/PayBandRepositoryTest.java`

**Interfaces:**
- Consumes: `country`, `fx_rate` (Task 3); `Role`, `Level` enums (Task 4); `Money` (Task 2).
- Produces:
  - `PayBandRepository.findByRoleAndLevelAndCountryCode(Role, Level, String)` → `Optional<PayBand>`
  - `payBand.mid()` → `Money`, `payBand.min()` → `Money`, `payBand.max()` → `Money`

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/salary/PayBandRepositoryTest.java`
```java
package com.payscope.salary;

import com.payscope.employee.Level;
import com.payscope.employee.Role;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class PayBandRepositoryTest {

    @Autowired
    PayBandRepository bands;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void seeds_a_band_for_every_role_level_country_combination_that_exists() {
        // 9 roles x 5 levels x 6 countries = 270, less 18 excluded principal combinations
        Integer count = jdbc.queryForObject("select count(*) from pay_band", Integer.class);

        assertThat(count).isEqualTo(252);
    }

    @Test
    void expresses_an_indian_band_in_rupees_at_the_expected_midpoint() {
        // base 110000 USD x level 1.35 x country 0.30 = 44550 USD, / 0.012 = 3712500 INR
        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                Role.SOFTWARE_ENGINEER, Level.SENIOR, "IN").orElseThrow();

        assertThat(band.mid().amount()).isEqualByComparingTo("3712500.00");
        assertThat(band.mid().currencyCode()).isEqualTo("INR");
        assertThat(band.min().amount()).isEqualByComparingTo("2970000.00");
        assertThat(band.max().amount()).isEqualByComparingTo("4640625.00");
    }

    @Test
    void expresses_the_same_role_and_level_at_a_different_midpoint_in_the_united_states() {
        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                Role.SOFTWARE_ENGINEER, Level.SENIOR, "US").orElseThrow();

        assertThat(band.mid().amount()).isEqualByComparingTo("148500.00");
        assertThat(band.mid().currencyCode()).isEqualTo("USD");
    }

    @Test
    void has_no_band_for_role_and_level_combinations_that_do_not_exist_in_the_organization() {
        // There are no principal recruiters. Employees in such a combination are
        // reported through summary.unbandedCount rather than dropped - see ADR-0002.
        assertThat(bands.findByRoleAndLevelAndCountryCode(Role.RECRUITER, Level.PRINCIPAL, "US"))
                .isEmpty();
    }

    @Test
    void keeps_band_currency_aligned_with_the_country() {
        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                Role.DESIGNER, Level.MID, "BR").orElseThrow();

        assertThat(band.mid().currencyCode()).isEqualTo("BRL");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=PayBandRepositoryTest`
Expected: FAIL — `PayBand` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/resources/db/migration/V3__pay_band.sql`
```sql
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
```

`src/main/java/com/payscope/salary/PayBand.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.Currency;

@Entity
@Table(name = "pay_band")
public class PayBand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_role")
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_level")
    private Level level;

    @Column(name = "country_code")
    private String countryCode;

    @Column(name = "currency_code")
    private String currencyCode;

    @Column(name = "band_min")
    private BigDecimal bandMin;

    @Column(name = "band_mid")
    private BigDecimal bandMid;

    @Column(name = "band_max")
    private BigDecimal bandMax;

    protected PayBand() {
    }

    public Money min() {
        return Money.of(bandMin, Currency.getInstance(currencyCode));
    }

    public Money mid() {
        return Money.of(bandMid, Currency.getInstance(currencyCode));
    }

    public Money max() {
        return Money.of(bandMax, Currency.getInstance(currencyCode));
    }

    public Role role() { return role; }
    public Level level() { return level; }
    public String countryCode() { return countryCode; }
    public String currencyCode() { return currencyCode; }
}
```

`src/main/java/com/payscope/salary/PayBandRepository.java`
```java
package com.payscope.salary;

import com.payscope.employee.Level;
import com.payscope.employee.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PayBandRepository extends JpaRepository<PayBand, Long> {

    Optional<PayBand> findByRoleAndLevelAndCountryCode(Role role, Level level, String countryCode);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=PayBandRepositoryTest`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/resources/db/migration/V3__pay_band.sql \
        src/main/java/com/payscope/salary src/test/java/com/payscope/salary
git commit -m "feat: add pay bands keyed on role, level and country

Bands are held in each country's own currency, so compa-ratio compares a
salary against its local market rather than against a global midpoint that
would flag every employee in a lower-cost country as underpaid.

Three roles deliberately have no principal grade, which keeps the unbanded
count a real figure instead of a permanent zero."
```

---

### Task 6: Salary and salary history schema and entities

Implements spec §3 and ADR-0004. Two tables: the current salary, and every superseded row.

**Files:**
- Create: `src/main/resources/db/migration/V4__salary_and_history.sql`
- Create: `src/main/java/com/payscope/salary/Salary.java`, `SalaryHistory.java`, `SalaryRepository.java`, `SalaryHistoryRepository.java`
- Test: `src/test/java/com/payscope/salary/SalaryRepositoryTest.java`

**Interfaces:**
- Consumes: `Money` (Task 2), `ConversionResult` (Task 3), `employee` table (Task 4).
- Produces:
  - `Salary.create(Long employeeId, Money original, ConversionResult converted, LocalDate effectiveFrom)` → `Salary`
  - `salary.original()` → `Money`, `salary.baseUsd()` → `Money`, `salary.effectiveFrom()` → `LocalDate`, `salary.version()` → `Long`, `salary.employeeId()` → `Long`, `salary.fxRate()` → `BigDecimal`, `salary.fxRateDate()` → `LocalDate`
  - `salary.replaceWith(Money original, ConversionResult converted, LocalDate effectiveFrom)` → `SalaryHistory` (the archived row)
  - `SalaryRepository.findByEmployeeId(Long)` → `Optional<Salary>`
  - `SalaryHistoryRepository.findByEmployeeIdOrderByEffectiveToDesc(Long)` → `List<SalaryHistory>`

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/salary/SalaryRepositoryTest.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import com.payscope.employee.Department;
import com.payscope.employee.Employee;
import com.payscope.employee.EmployeeRepository;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
@Transactional
class SalaryRepositoryTest {

    private static final ConversionResult INR_CONVERSION =
            new ConversionResult(Money.of("42000.00", "USD"), new BigDecimal("0.01200000"), LocalDate.of(2026, 1, 1));

    @Autowired
    EmployeeRepository employees;

    @Autowired
    SalaryRepository salaries;

    @Autowired
    SalaryHistoryRepository history;

    private Long anEmployeeId(String number, String email) {
        return employees.saveAndFlush(Employee.create(number, "Asha Menon", email, Department.ENGINEERING,
                "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR, EmploymentType.FULL_TIME,
                LocalDate.of(2024, 3, 1))).id();
    }

    @Test
    void persists_the_original_amount_the_converted_amount_and_the_rate_that_produced_it() {
        Long employeeId = anEmployeeId("E-1001", "s1@acme.test");

        salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        Salary found = salaries.findByEmployeeId(employeeId).orElseThrow();
        assertThat(found.original().amount()).isEqualByComparingTo("3500000.00");
        assertThat(found.original().currencyCode()).isEqualTo("INR");
        assertThat(found.baseUsd().amount()).isEqualByComparingTo("42000.00");
        assertThat(found.fxRate()).isEqualByComparingTo("0.01200000");
        assertThat(found.fxRateDate()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    void allows_only_one_current_salary_per_employee() {
        Long employeeId = anEmployeeId("E-1002", "s2@acme.test");
        salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        assertThatThrownBy(() -> salaries.saveAndFlush(Salary.create(employeeId,
                Money.of("4000000.00", "INR"), INR_CONVERSION, LocalDate.of(2026, 6, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() {
        Long employeeId = anEmployeeId("E-1003", "s3@acme.test");

        assertThatThrownBy(() -> salaries.saveAndFlush(Salary.create(employeeId,
                Money.of("0.00", "INR"),
                new ConversionResult(Money.of("0.00", "USD"), new BigDecimal("0.01200000"),
                        LocalDate.of(2026, 1, 1)),
                LocalDate.of(2026, 1, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void archives_the_superseded_row_when_a_salary_is_replaced() {
        Long employeeId = anEmployeeId("E-1004", "s4@acme.test");
        Salary salary = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        SalaryHistory archived = salary.replaceWith(Money.of("4000000.00", "INR"),
                new ConversionResult(Money.of("48000.00", "USD"), new BigDecimal("0.01200000"),
                        LocalDate.of(2026, 1, 1)),
                LocalDate.of(2026, 7, 1));
        history.saveAndFlush(archived);
        salaries.saveAndFlush(salary);

        Salary current = salaries.findByEmployeeId(employeeId).orElseThrow();
        assertThat(current.original().amount()).isEqualByComparingTo("4000000.00");
        assertThat(current.effectiveFrom()).isEqualTo(LocalDate.of(2026, 7, 1));

        List<SalaryHistory> archivedRows = history.findByEmployeeIdOrderByEffectiveToDesc(employeeId);
        assertThat(archivedRows).hasSize(1);
        assertThat(archivedRows.get(0).original().amount()).isEqualByComparingTo("3500000.00");
        assertThat(archivedRows.get(0).effectiveFrom()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(archivedRows.get(0).effectiveTo()).isEqualTo(LocalDate.of(2026, 7, 1));
    }

    @Test
    void keeps_the_rate_frozen_on_an_archived_row_rather_than_recomputing_it() {
        Long employeeId = anEmployeeId("E-1005", "s5@acme.test");
        Salary salary = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        SalaryHistory archived = salary.replaceWith(Money.of("4000000.00", "INR"),
                new ConversionResult(Money.of("52000.00", "USD"), new BigDecimal("0.01300000"),
                        LocalDate.of(2026, 6, 1)),
                LocalDate.of(2026, 7, 1));
        history.saveAndFlush(archived);

        assertThat(archived.fxRate()).isEqualByComparingTo("0.01200000");
        assertThat(archived.baseUsd().amount()).isEqualByComparingTo("42000.00");
    }

    @Test
    void starts_every_salary_at_version_zero() {
        Long employeeId = anEmployeeId("E-1006", "s6@acme.test");

        Salary saved = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        assertThat(saved.version()).isZero();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=SalaryRepositoryTest`
Expected: FAIL — `Salary` and `SalaryHistory` do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/resources/db/migration/V4__salary_and_history.sql`
```sql
create table salary (
    id              bigserial     primary key,
    employee_id     bigint        not null references employee (id),
    amount_original numeric(19,4) not null,
    currency_code   varchar(3)       not null,
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
    currency_code   varchar(3)       not null,
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
```

`src/main/java/com/payscope/salary/Salary.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Currency;

@Entity
@Table(name = "salary")
public class Salary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "amount_original")
    private BigDecimal amountOriginal;

    @Column(name = "currency_code")
    private String currencyCode;

    @Column(name = "amount_base_usd")
    private BigDecimal amountBaseUsd;

    @Column(name = "fx_rate")
    private BigDecimal fxRate;

    @Column(name = "fx_rate_date")
    private LocalDate fxRateDate;

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Version
    private Long version;

    protected Salary() {
    }

    public static Salary create(Long employeeId, Money original, ConversionResult converted,
                                LocalDate effectiveFrom) {
        Salary salary = new Salary();
        salary.employeeId = employeeId;
        salary.apply(original, converted, effectiveFrom);
        return salary;
    }

    /**
     * Replaces this salary and returns the superseded values as a history row.
     * The caller persists both inside one transaction - see ADR-0004.
     */
    public SalaryHistory replaceWith(Money original, ConversionResult converted, LocalDate effectiveFrom) {
        SalaryHistory archived = SalaryHistory.of(employeeId, original(), baseUsd(), fxRate, fxRateDate,
                this.effectiveFrom, effectiveFrom);
        apply(original, converted, effectiveFrom);
        return archived;
    }

    private void apply(Money original, ConversionResult converted, LocalDate effectiveFrom) {
        this.amountOriginal = original.amount();
        this.currencyCode = original.currencyCode();
        this.amountBaseUsd = converted.baseUsd().amount();
        this.fxRate = converted.rate();
        this.fxRateDate = converted.rateDate();
        this.effectiveFrom = effectiveFrom;
    }

    public Money original() {
        return Money.of(amountOriginal, Currency.getInstance(currencyCode));
    }

    public Money baseUsd() {
        return Money.of(amountBaseUsd, Currency.getInstance("USD"));
    }

    public Long id() { return id; }
    public Long employeeId() { return employeeId; }
    public BigDecimal fxRate() { return fxRate; }
    public LocalDate fxRateDate() { return fxRateDate; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public Long version() { return version; }
}
```

`src/main/java/com/payscope/salary/SalaryHistory.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Currency;

@Entity
@Table(name = "salary_history")
public class SalaryHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "amount_original")
    private BigDecimal amountOriginal;

    @Column(name = "currency_code")
    private String currencyCode;

    @Column(name = "amount_base_usd")
    private BigDecimal amountBaseUsd;

    @Column(name = "fx_rate")
    private BigDecimal fxRate;

    @Column(name = "fx_rate_date")
    private LocalDate fxRateDate;

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "change_reason")
    private String changeReason;

    protected SalaryHistory() {
    }

    /**
     * Built from the values being superseded. The rate is copied, never
     * recomputed, so a historical figure stays what it was - see ADR-0001.
     */
    static SalaryHistory of(Long employeeId, Money original, Money baseUsd, BigDecimal fxRate,
                            LocalDate fxRateDate, LocalDate effectiveFrom, LocalDate effectiveTo) {
        SalaryHistory row = new SalaryHistory();
        row.employeeId = employeeId;
        row.amountOriginal = original.amount();
        row.currencyCode = original.currencyCode();
        row.amountBaseUsd = baseUsd.amount();
        row.fxRate = fxRate;
        row.fxRateDate = fxRateDate;
        row.effectiveFrom = effectiveFrom;
        row.effectiveTo = effectiveTo;
        return row;
    }

    public void recordReason(String changeReason) {
        this.changeReason = changeReason;
    }

    public Money original() {
        return Money.of(amountOriginal, Currency.getInstance(currencyCode));
    }

    public Money baseUsd() {
        return Money.of(amountBaseUsd, Currency.getInstance("USD"));
    }

    public Long id() { return id; }
    public Long employeeId() { return employeeId; }
    public BigDecimal fxRate() { return fxRate; }
    public LocalDate fxRateDate() { return fxRateDate; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public String changeReason() { return changeReason; }
}
```

`src/main/java/com/payscope/salary/SalaryRepository.java`
```java
package com.payscope.salary;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SalaryRepository extends JpaRepository<Salary, Long> {

    Optional<Salary> findByEmployeeId(Long employeeId);
}
```

`src/main/java/com/payscope/salary/SalaryHistoryRepository.java`
```java
package com.payscope.salary;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalaryHistoryRepository extends JpaRepository<SalaryHistory, Long> {

    List<SalaryHistory> findByEmployeeIdOrderByEffectiveToDesc(Long employeeId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=SalaryRepositoryTest`
Expected: PASS — 6 tests.

- [ ] **Step 5: Remove the unused import and re-run**

`SalaryRepository` imports `jakarta.persistence.LockModeType` but does not use it yet — Task 13 adds the `FOR SHARE` lock. Delete the import now; add it back when it is needed.

Run: `./mvnw test -Dtest=SalaryRepositoryTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/resources/db/migration/V4__salary_and_history.sql \
        src/main/java/com/payscope/salary src/test/java/com/payscope/salary
git commit -m "feat: add salary and salary history schema

Current salary sits in its own table with a unique constraint on
employee_id, so exactly one current salary per employee is a database
guarantee. Superseded rows are archived with the exchange rate that
produced them, frozen rather than recomputed."
```

---

### Task 7: Compa-ratio calculation

Pure domain. Implements ADR-0002's fairness measure and the 80/120 outlier thresholds from spec §8.

**Files:**
- Create: `src/main/java/com/payscope/salary/CompaRatio.java`
- Test: `src/test/java/com/payscope/salary/CompaRatioTest.java`

**Interfaces:**
- Consumes: `Money` (Task 2).
- Produces:
  - `CompaRatio.of(Money salary, Money bandMid)` → `BigDecimal` scale 4, or `null` when `bandMid` is `null`
  - `CompaRatio.isOutlier(BigDecimal ratio)` → `boolean` (`false` for `null`)
  - `CompaRatio.LOW` = `0.80`, `CompaRatio.HIGH` = `1.20`

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/salary/CompaRatioTest.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompaRatioTest {

    @Test
    void is_one_when_the_salary_sits_exactly_on_the_band_midpoint() {
        assertThat(CompaRatio.of(Money.of("100000.00", "USD"), Money.of("100000.00", "USD")))
                .isEqualByComparingTo("1.0000");
    }

    @Test
    void is_below_one_when_the_salary_is_under_the_midpoint() {
        assertThat(CompaRatio.of(Money.of("75000.00", "USD"), Money.of("100000.00", "USD")))
                .isEqualByComparingTo("0.7500");
    }

    @Test
    void compares_rupees_against_a_rupee_band_without_any_exchange_rate() {
        assertThat(CompaRatio.of(Money.of("3712500.00", "INR"), Money.of("3712500.00", "INR")))
                .isEqualByComparingTo("1.0000");
    }

    @Test
    void is_null_when_the_role_level_and_country_combination_has_no_band() {
        assertThat(CompaRatio.of(Money.of("100000.00", "USD"), null)).isNull();
    }

    @Test
    void refuses_to_compare_a_salary_against_a_band_in_another_currency() {
        assertThatThrownBy(() -> CompaRatio.of(Money.of("100000.00", "USD"), Money.of("100000.00", "GBP")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void treats_exactly_eighty_and_exactly_one_hundred_and_twenty_percent_as_within_band() {
        assertThat(CompaRatio.isOutlier(new BigDecimal("0.8000"))).isFalse();
        assertThat(CompaRatio.isOutlier(new BigDecimal("1.2000"))).isFalse();
    }

    @Test
    void flags_anything_outside_the_eighty_to_one_hundred_and_twenty_percent_window() {
        assertThat(CompaRatio.isOutlier(new BigDecimal("0.7999"))).isTrue();
        assertThat(CompaRatio.isOutlier(new BigDecimal("1.2001"))).isTrue();
    }

    @Test
    void never_flags_an_unbanded_employee_as_an_outlier() {
        assertThat(CompaRatio.isOutlier(null)).isFalse();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=CompaRatioTest`
Expected: FAIL — `CompaRatio` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/salary/CompaRatio.java`
```java
package com.payscope.salary;

import com.payscope.common.Money;

import java.math.BigDecimal;

/**
 * A salary as a proportion of its band midpoint. Both sides are in the same
 * local currency, so the figure carries no exchange-rate exposure and is
 * comparable across countries - see ADR-0002.
 */
public final class CompaRatio {

    public static final BigDecimal LOW = new BigDecimal("0.80");
    public static final BigDecimal HIGH = new BigDecimal("1.20");

    private CompaRatio() {
    }

    /**
     * Null when the employee's role, level and country combination has no band.
     * Such employees still count in headcount and payroll totals; they are
     * reported through summary.unbandedCount rather than dropped.
     */
    public static BigDecimal of(Money salary, Money bandMid) {
        if (bandMid == null) {
            return null;
        }
        return salary.ratioTo(bandMid);
    }

    public static boolean isOutlier(BigDecimal ratio) {
        if (ratio == null) {
            return false;
        }
        return ratio.compareTo(LOW) < 0 || ratio.compareTo(HIGH) > 0;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=CompaRatioTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/salary/CompaRatio.java src/test/java/com/payscope/salary/CompaRatioTest.java
git commit -m "feat: add compa-ratio calculation with 80/120 outlier thresholds

Salary and band are always in the same currency, so the ratio is
dimensionless and comparable across countries. An unbanded employee
yields null and is never flagged as an outlier."
```

---

### Task 8: Error handling and employee creation

The first endpoint, so it carries the error-handling foundation every later task extends: `ProblemDetail` responses, field-level validation errors, and the 409 mapping. Implements spec §8 `POST /employees` and §8's validation layers.

**Files:**
- Create: `src/main/java/com/payscope/common/NotFoundException.java`
- Create: `src/main/java/com/payscope/common/ApiExceptionHandler.java`
- Create: `src/main/java/com/payscope/common/MoneyDto.java`
- Create: `src/main/java/com/payscope/employee/dto/CreateEmployeeRequest.java`
- Create: `src/main/java/com/payscope/employee/EmployeeService.java`, `EmployeeController.java`
- Create: `src/test/java/com/payscope/support/FixedClockConfig.java`
- Test: `src/test/java/com/payscope/employee/CreateEmployeeApiTest.java`

**Interfaces:**
- Consumes: `Employee.create` (Task 4), `Salary.create` (Task 6), `CurrencyConverter.toUsd` (Task 3), `CountryRepository` (Task 3), `DomainException` (Task 3).
- Produces:
  - `NotFoundException(String message)` → mapped to 404.
  - `MoneyDto(String amount, String currency)` with `MoneyDto.from(Money)` and `toMoney()`.
  - `EmployeeService.create(CreateEmployeeRequest)` → `Long` (new employee id).
  - `POST /api/employees` → `201` with `Location: /api/employees/{id}`.
  - `FixedClockConfig` — test `Clock` fixed at `2026-09-12T00:00:00Z`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/support/FixedClockConfig.java`
```java
package com.payscope.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

/**
 * Every date-dependent rule reads this. Tests that assert "not in the future"
 * behaviour would otherwise depend on the wall clock, which CLAUDE.md forbids.
 */
@TestConfiguration(proxyBeanMethods = false)
public class FixedClockConfig {

    public static final Instant NOW = Instant.parse("2026-09-12T00:00:00Z");

    @Bean
    @Primary
    Clock fixedClock() {
        return Clock.fixed(NOW, ZoneOffset.UTC);
    }
}
```

`src/test/java/com/payscope/employee/CreateEmployeeApiTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class CreateEmployeeApiTest {

    @Autowired
    MockMvc mvc;

    private String requestBody(String employeeNumber, String email, String amount, String currency,
                               String countryCode, String hireDate) {
        return """
                {
                  "employeeNumber": "%s",
                  "fullName": "Asha Menon",
                  "email": "%s",
                  "department": "ENGINEERING",
                  "countryCode": "%s",
                  "role": "SOFTWARE_ENGINEER",
                  "level": "SENIOR",
                  "employmentType": "FULL_TIME",
                  "hireDate": "%s",
                  "salary": { "amount": "%s", "currency": "%s" },
                  "salaryEffectiveFrom": "%s"
                }
                """.formatted(employeeNumber, email, countryCode, hireDate, amount, currency, hireDate);
    }

    @Test
    void creates_an_employee_with_an_initial_salary_and_returns_its_location() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2001", "create1@acme.test", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/employees/\\d+")));
    }

    @Test
    void rejects_a_malformed_email_with_a_field_level_error() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2002", "not-an-email", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors[0].field").value("email"));
    }

    @Test
    void rejects_a_salary_denominated_in_a_currency_the_country_does_not_use() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2003", "create3@acme.test", "80000.00", "GBP", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("INR")))
                .andExpect(jsonPath("$.detail", containsString("GBP")));
    }

    @Test
    void rejects_a_hire_date_in_the_future() throws Exception {
        // The fixed clock reads 2026-09-12, so this date has not happened yet.
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2004", "create4@acme.test", "3500000.00", "INR", "IN", "2027-01-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("future")));
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2005", "create5@acme.test", "0.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("positive")));
    }

    @Test
    void rejects_an_unknown_country() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2006", "create6@acme.test", "3500000.00", "INR", "ZZ", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("ZZ")));
    }

    @Test
    void rejects_a_second_employee_with_the_same_email_as_a_conflict() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                .content(requestBody("E-2007", "dupe@acme.test", "3500000.00", "INR", "IN", "2024-03-01")));

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2008", "dupe@acme.test", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void rejects_an_unparseable_enum_with_four_hundred_and_lists_the_permitted_values() throws Exception {
        String body = requestBody("E-2009", "create9@acme.test", "3500000.00", "INR", "IN", "2024-03-01")
                .replace("\"SENIOR\"", "\"ARCHMAGE\"");

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("SENIOR")));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=CreateEmployeeApiTest`
Expected: FAIL — no controller exists; all requests return 404.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/common/NotFoundException.java`
```java
package com.payscope.common;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
```

`src/main/java/com/payscope/common/MoneyDto.java`
```java
package com.payscope.common;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.util.Currency;

/**
 * Money crosses the wire as a string. A BigDecimal serialized as a JSON number
 * is parsed into a JavaScript double on arrival, which is the double-for-money
 * failure CLAUDE.md forbids, merely relocated to the browser.
 */
public record MoneyDto(@NotBlank String amount, @NotBlank String currency) {

    public static MoneyDto from(Money money) {
        return new MoneyDto(money.amount().toPlainString(), money.currencyCode());
    }

    public Money toMoney() {
        try {
            return Money.of(new BigDecimal(amount), Currency.getInstance(currency));
        } catch (IllegalArgumentException e) {
            throw new DomainException("Not a valid amount and currency: " + amount + " " + currency);
        }
    }
}
```

`src/main/java/com/payscope/common/ApiExceptionHandler.java`
```java
package com.payscope.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    public record FieldError(String field, String message) {
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail onValidationFailure(MethodArgumentNotValidException e) {
        List<FieldError> errors = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new FieldError(f.getField(), f.getDefaultMessage()))
                .toList();

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Validation failed");
        problem.setDetail("One or more fields are invalid");
        problem.setProperty("errors", errors);
        return problem;
    }

    /**
     * An unparseable enum in a request body arrives here. Spring's default is a
     * 500, which is indefensible for a client mistake, so the permitted values
     * are listed instead.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail onUnreadableBody(HttpMessageNotReadableException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Malformed request");
        problem.setDetail(rootMessage(e));
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail onBadParameter(MethodArgumentTypeMismatchException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Invalid parameter");
        problem.setDetail(rootMessage(e));
        return problem;
    }

    @ExceptionHandler(DomainException.class)
    ProblemDetail onDomainRuleViolation(DomainException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Rule violation");
        problem.setDetail(e.getMessage());
        return problem;
    }

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail onNotFound(NotFoundException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setTitle("Not found");
        problem.setDetail(e.getMessage());
        return problem;
    }

    private static final String GENERIC_CONFLICT =
            "This change conflicts with data that already exists";

    /** Constraint name -> the message a client can actually act on. */
    private static final Map<String, String> UNIQUE_CONFLICTS = Map.of(
            "employee_email_unique", "That email address is already in use",
            "employee_number_unique", "That employee number is already in use",
            "salary_one_per_employee", "That employee already has a current salary");

    /**
     * Uniqueness is enforced by a partial unique index, never by a
     * SELECT-then-INSERT pre-check, which loses under concurrency - ADR-0007.
     *
     * A unique violation is a genuine conflict and maps to 409. A check
     * violation is invalid data that the service layer should have rejected
     * first, so it maps to 400 - reporting it as a conflict would tell the
     * client to retry something that can never succeed.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail onConstraintViolation(DataIntegrityViolationException e) {
        String constraint = e.getCause() instanceof ConstraintViolationException violation
                ? violation.getConstraintName() : null;
        String cause = e.getMostSpecificCause().getMessage();

        if (cause != null && cause.contains("violates check constraint")) {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
            problem.setTitle("Rule violation");
            problem.setDetail(constraint == null
                    ? "Rejected by a database rule"
                    : "Rejected by the database rule " + constraint);
            return problem;
        }

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        // Guarded rather than getOrDefault(constraint, ...): UNIQUE_CONFLICTS is a
        // Map.of(...), and those throw NullPointerException on a null key instead
        // of returning the default. A DataIntegrityViolationException whose cause
        // is not a Hibernate ConstraintViolationException - a numeric overflow,
        // say - has no constraint name, and crashing here would turn a graceful
        // 409 into a 500.
        problem.setDetail(constraint == null
                ? GENERIC_CONFLICT
                : UNIQUE_CONFLICTS.getOrDefault(constraint, GENERIC_CONFLICT));
        return problem;
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail onStaleVersion(OptimisticLockingFailureException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        problem.setDetail("This record changed since you loaded it. Reload and try again.");
        return problem;
    }

    private String rootMessage(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause.getMessage();
    }
}
```

`src/main/java/com/payscope/employee/dto/CreateEmployeeRequest.java`
```java
package com.payscope.employee.dto;

import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Creating an employee always creates their first salary. There is no
 * meaningful state in which an employee exists with no pay, and permitting one
 * would force a null branch into every analytics query forever - spec section 8.
 *
 * Note the absence of @PastOrPresent on hireDate: that annotation reads the wall
 * clock. The rule lives in EmployeeService, which uses the injected Clock.
 */
public record CreateEmployeeRequest(
        @NotBlank @Size(max = 20) String employeeNumber,
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotNull Department department,
        @NotBlank @Size(min = 2, max = 2) String countryCode,
        @NotNull Role role,
        @NotNull Level level,
        @NotNull EmploymentType employmentType,
        @NotNull LocalDate hireDate,
        @NotNull @Valid MoneyDto salary,
        @NotNull LocalDate salaryEffectiveFrom) {
}
```

`src/main/java/com/payscope/employee/EmployeeService.java`
```java
package com.payscope.employee;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.dto.CreateEmployeeRequest;
import com.payscope.salary.Salary;
import com.payscope.salary.SalaryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

@Service
public class EmployeeService {

    private final EmployeeRepository employees;
    private final SalaryRepository salaries;
    private final CountryRepository countries;
    private final CurrencyConverter converter;
    private final Clock clock;

    public EmployeeService(EmployeeRepository employees, SalaryRepository salaries,
                           CountryRepository countries, CurrencyConverter converter, Clock clock) {
        this.employees = employees;
        this.salaries = salaries;
        this.countries = countries;
        this.converter = converter;
        this.clock = clock;
    }

    @Transactional
    public Long create(CreateEmployeeRequest request) {
        LocalDate today = LocalDate.now(clock);

        if (request.hireDate().isAfter(today)) {
            throw new DomainException("Hire date " + request.hireDate() + " is in the future");
        }

        Country country = countries.findById(request.countryCode())
                .orElseThrow(() -> new DomainException("Unknown country code: " + request.countryCode()));

        Money salary = request.salary().toMoney();

        if (!salary.currencyCode().equals(country.currencyCode())) {
            throw new DomainException("Employees in " + country.countryCode() + " are paid in "
                    + country.currencyCode() + ", not " + salary.currencyCode());
        }
        if (!salary.isPositive()) {
            throw new DomainException("Salary must be strictly positive");
        }
        if (request.salaryEffectiveFrom().isBefore(request.hireDate())) {
            throw new DomainException("Salary cannot take effect before the hire date");
        }
        if (request.salaryEffectiveFrom().isAfter(today)) {
            throw new DomainException("Salary effective date " + request.salaryEffectiveFrom()
                    + " is in the future");
        }

        Employee employee = employees.saveAndFlush(Employee.create(
                request.employeeNumber(), request.fullName(), request.email(), request.department(),
                request.countryCode(), request.role(), request.level(), request.employmentType(),
                request.hireDate()));

        ConversionResult converted = converter.toUsd(salary, request.salaryEffectiveFrom());
        salaries.saveAndFlush(Salary.create(employee.id(), salary, converted, request.salaryEffectiveFrom()));

        return employee.id();
    }
}
```

`src/main/java/com/payscope/employee/EmployeeController.java`
```java
package com.payscope.employee;

import com.payscope.employee.dto.CreateEmployeeRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

    private final EmployeeService service;

    public EmployeeController(EmployeeService service) {
        this.service = service;
    }

    @PostMapping
    ResponseEntity<Void> create(@Valid @RequestBody CreateEmployeeRequest request) {
        Long id = service.create(request);
        return ResponseEntity.created(URI.create("/api/employees/" + id)).build();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=CreateEmployeeApiTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/common src/main/java/com/payscope/employee \
        src/test/java/com/payscope/support/FixedClockConfig.java \
        src/test/java/com/payscope/employee/CreateEmployeeApiTest.java
git commit -m "feat: create an employee together with an initial salary

Employee and first salary are written in one transaction, so no employee
ever exists without pay. Hire-date validation reads the injected Clock
rather than @PastOrPresent, which would depend on the wall clock and make
the rule untestable."
```

---

### Task 9: Employee detail

Implements spec §8 `GET /employees/{id}`. Returns both optimistic-lock tokens, because the client needs a different one for editing the record than for recording a raise.

**Files:**
- Create: `src/main/java/com/payscope/employee/dto/EmployeeDetailResponse.java`
- Modify: `src/main/java/com/payscope/employee/EmployeeService.java` (add `detail`)
- Modify: `src/main/java/com/payscope/employee/EmployeeController.java` (add `GET /{id}`)
- Test: `src/test/java/com/payscope/employee/EmployeeDetailApiTest.java`

**Interfaces:**
- Consumes: `PayBandRepository` (Task 5), `SalaryRepository` (Task 6), `CompaRatio` (Task 7), `NotFoundException` (Task 8).
- Produces:
  - `EmployeeService.detail(Long id)` → `EmployeeDetailResponse`; throws `NotFoundException` when absent **or** soft-deleted.
  - `EmployeeDetailResponse` fields: `id`, `employeeNumber`, `fullName`, `email`, `department`, `countryCode`, `role`, `level`, `employmentType`, `hireDate`, `status`, `salary` (`MoneyDto`), `salaryBaseUsd` (`MoneyDto`), `salaryEffectiveFrom`, `compaRatio` (`BigDecimal`, nullable), `bandMin`/`bandMid`/`bandMax` (`MoneyDto`, nullable), `employeeVersion`, `salaryVersion`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/employee/EmployeeDetailApiTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class EmployeeDetailApiTest {

    @Autowired
    MockMvc mvc;

    /** Creates an employee and returns their id, parsed from the Location header. */
    private long create(String number, String email, String amount, String currency, String country,
                        String role, String level) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "%s", "role": "%s",
                          "level": "%s", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "%s", "currency": "%s" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email, country, role, level, amount, currency)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    @Test
    void returns_the_record_with_salary_in_both_currencies_and_both_version_tokens() throws Exception {
        long id = create("E-3001", "d1@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Asha Menon"))
                .andExpect(jsonPath("$.salary.amount").value("3712500.00"))
                .andExpect(jsonPath("$.salary.currency").value("INR"))
                .andExpect(jsonPath("$.salaryBaseUsd.amount").value("44550.00"))
                .andExpect(jsonPath("$.salaryBaseUsd.currency").value("USD"))
                .andExpect(jsonPath("$.employeeVersion").value(0))
                .andExpect(jsonPath("$.salaryVersion").value(0));
    }

    @Test
    void serializes_money_as_a_string_never_as_a_json_number() throws Exception {
        long id = create("E-3002", "d2@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.salary.amount").isString());
    }

    @Test
    void reports_a_compa_ratio_of_one_for_a_salary_on_the_band_midpoint() throws Exception {
        long id = create("E-3003", "d3@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(1.0000))
                .andExpect(jsonPath("$.bandMid.amount").value("3712500.00"));
    }

    @Test
    void reports_a_compa_ratio_below_one_for_a_salary_under_the_midpoint() throws Exception {
        // 2970000 / 3712500 = 0.8000
        long id = create("E-3004", "d4@acme.test", "2970000.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(0.8000));
    }

    @Test
    void reports_a_null_compa_ratio_and_no_band_for_a_combination_with_no_band() throws Exception {
        long id = create("E-3005", "d5@acme.test", "100000.00", "USD", "US", "RECRUITER", "PRINCIPAL");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.compaRatio").doesNotExist())
                .andExpect(jsonPath("$.bandMid").doesNotExist());
    }

    @Test
    void returns_not_found_for_an_id_that_never_existed() throws Exception {
        mvc.perform(get("/api/employees/{id}", 999_999_999L))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString("999999999")));
    }

    @Test
    void returns_not_found_rather_than_gone_for_a_soft_deleted_employee() throws Exception {
        long id = create("E-3006", "d6@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString(String.valueOf(id))));
    }
}
```

Note: the last test needs `DELETE` from Task 11. Implement Task 11 first if running strictly in order, or mark that single test `@Disabled("enabled by Task 11")` and remove the annotation there.

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=EmployeeDetailApiTest`
Expected: FAIL — `GET /api/employees/{id}` returns 404 for every id, because no handler is mapped.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/employee/dto/EmployeeDetailResponse.java`
```java
package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

import java.math.BigDecimal;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EmployeeDetailResponse(
        Long id,
        String employeeNumber,
        String fullName,
        String email,
        Department department,
        String countryCode,
        Role role,
        Level level,
        EmploymentType employmentType,
        LocalDate hireDate,
        EmployeeStatus status,
        MoneyDto salary,
        MoneyDto salaryBaseUsd,
        LocalDate salaryEffectiveFrom,
        BigDecimal compaRatio,
        MoneyDto bandMin,
        MoneyDto bandMid,
        MoneyDto bandMax,
        Long employeeVersion,
        Long salaryVersion) {
}
```

`src/main/java/com/payscope/employee/EmployeeService.java` — add these imports and method:
```java
// add to imports
import com.payscope.common.MoneyDto;
import com.payscope.common.NotFoundException;
import com.payscope.employee.dto.EmployeeDetailResponse;
import com.payscope.salary.CompaRatio;
import com.payscope.salary.PayBand;
import com.payscope.salary.PayBandRepository;
import com.payscope.salary.Salary;

// add PayBandRepository bands to the constructor and field list

    @Transactional(readOnly = true)
    public EmployeeDetailResponse detail(Long id) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));

        Salary salary = salaries.findByEmployeeId(id)
                .orElseThrow(() -> new IllegalStateException(
                        "Employee " + id + " has no current salary, which creation makes impossible"));

        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                employee.role(), employee.level(), employee.countryCode()).orElse(null);

        return new EmployeeDetailResponse(
                employee.id(), employee.employeeNumber(), employee.fullName(), employee.email(),
                employee.department(), employee.countryCode(), employee.role(), employee.level(),
                employee.employmentType(), employee.hireDate(), employee.status(),
                MoneyDto.from(salary.original()), MoneyDto.from(salary.baseUsd()), salary.effectiveFrom(),
                CompaRatio.of(salary.original(), band == null ? null : band.mid()),
                band == null ? null : MoneyDto.from(band.min()),
                band == null ? null : MoneyDto.from(band.mid()),
                band == null ? null : MoneyDto.from(band.max()),
                employee.version(), salary.version());
    }
```

`src/main/java/com/payscope/employee/EmployeeController.java` — add:
```java
// add to imports
import com.payscope.employee.dto.EmployeeDetailResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

    @GetMapping("/{id}")
    EmployeeDetailResponse detail(@PathVariable Long id) {
        return service.detail(id);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=EmployeeDetailApiTest`
Expected: PASS — 7 tests (6 if the soft-delete test is still disabled).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/employee src/test/java/com/payscope/employee/EmployeeDetailApiTest.java
git commit -m "feat: return employee detail with compa-ratio and both version tokens

employeeVersion and salaryVersion are separate fields: editing a record
and recording a raise guard different rows, and a single ambiguous
version would let a client send the wrong one."
```

---

### Task 10: Updating an employee, guarded by `employeeVersion`

Implements ADR-0007 for the edit path. Covers the deterministic, thread-free concurrency test from spec §12.

**Files:**
- Create: `src/main/java/com/payscope/employee/dto/UpdateEmployeeRequest.java`
- Modify: `src/main/java/com/payscope/employee/EmployeeService.java` (add `update`)
- Modify: `src/main/java/com/payscope/employee/EmployeeController.java` (add `PUT /{id}`)
- Test: `src/test/java/com/payscope/employee/UpdateEmployeeApiTest.java`
- Test: `src/test/java/com/payscope/employee/EmployeeOptimisticLockTest.java`

**Interfaces:**
- Consumes: everything from Task 9.
- Produces: `EmployeeService.update(Long id, UpdateEmployeeRequest)` → `EmployeeDetailResponse`; throws `ObjectOptimisticLockingFailureException` on a stale `employeeVersion`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/employee/EmployeeOptimisticLockTest.java`
```java
package com.payscope.employee;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * No threads. Two detached copies reproduce the exact interleaving of a lost
 * update on every run, where a racing thread would be timing-dependent and
 * flaky - see spec section 12.
 */
@IntegrationTest
class EmployeeOptimisticLockTest {

    @Autowired
    EmployeeRepository employees;

    @Test
    void rejects_the_second_of_two_writers_holding_the_same_version() {
        Employee saved = employees.saveAndFlush(Employee.create("E-4001", "First Name",
                "lock1@acme.test", Department.ENGINEERING, "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR,
                EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1)));
        Long id = saved.id();

        Employee writerOne = employees.findById(id).orElseThrow();
        Employee writerTwo = employees.findById(id).orElseThrow();
        employees.getClass();

        writerOne.rename("Renamed By One");
        employees.saveAndFlush(writerOne);

        writerTwo.rename("Renamed By Two");
        assertThatThrownBy(() -> employees.saveAndFlush(writerTwo))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);

        assertThat(employees.findById(id).orElseThrow().fullName()).isEqualTo("Renamed By One");
    }

    @Test
    void increments_the_version_on_every_successful_write() {
        Employee saved = employees.saveAndFlush(Employee.create("E-4002", "Version Person",
                "lock2@acme.test", Department.SALES, "GB", Role.ACCOUNT_EXECUTIVE, Level.MID,
                EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1)));
        assertThat(saved.version()).isZero();

        saved.rename("Version Person Renamed");
        Employee updated = employees.saveAndFlush(saved);

        assertThat(updated.version()).isEqualTo(1L);
    }
}
```

Note: `writerTwo` must be a genuinely separate instance. Because both `findById` calls share a persistence context outside a transaction, each call opens and closes its own `EntityManager`, so the two are distinct detached objects. If a future refactor puts this test inside `@Transactional`, the two would be the *same* managed instance and the test would silently stop testing anything — do not add `@Transactional` to this class.

`src/test/java/com/payscope/employee/UpdateEmployeeApiTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class UpdateEmployeeApiTest {

    @Autowired
    MockMvc mvc;

    private long create(String number, String email) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email)))
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    private String updateBody(String fullName, String level, long version) {
        return """
                {
                  "fullName": "%s", "email": "updated@acme.test", "department": "PRODUCT",
                  "role": "PRODUCT_MANAGER", "level": "%s", "employmentType": "FULL_TIME",
                  "employeeVersion": %d
                }
                """.formatted(fullName, level, version);
    }

    @Test
    void applies_the_change_and_returns_the_incremented_version() throws Exception {
        long id = create("E-5001", "u1@acme.test");

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Asha Menon-Rao", "STAFF", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Asha Menon-Rao"))
                .andExpect(jsonPath("$.level").value("STAFF"))
                .andExpect(jsonPath("$.employeeVersion").value(1));
    }

    @Test
    void recomputes_compa_ratio_against_the_band_for_the_new_level() throws Exception {
        long id = create("E-5002", "u2@acme.test");

        // PRODUCT_MANAGER / STAFF / IN mid = 125000 x 1.70 x 0.30 / 0.012 = 5312500 INR.
        // The salary is unchanged at 3712500, so 3712500 / 5312500 = 0.6988.
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("Asha Menon", "STAFF", 0)));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(0.6988));
    }

    @Test
    void rejects_a_stale_version_with_a_conflict() throws Exception {
        long id = create("E-5003", "u3@acme.test");
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("First Edit", "STAFF", 0)));

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Second Edit", "STAFF", 0)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void reports_the_current_version_in_the_conflict_so_the_client_can_recover() throws Exception {
        long id = create("E-5004", "u4@acme.test");
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("First Edit", "STAFF", 0)));

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Second Edit", "STAFF", 0)))
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void requires_a_version_on_every_update() throws Exception {
        long id = create("E-5005", "u5@acme.test");

        String withoutVersion = """
                {
                  "fullName": "No Version", "email": "nv@acme.test", "department": "PRODUCT",
                  "role": "PRODUCT_MANAGER", "level": "STAFF", "employmentType": "FULL_TIME"
                }
                """;

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON).content(withoutVersion))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("employeeVersion"));
    }

    @Test
    void returns_not_found_when_updating_an_employee_that_does_not_exist() throws Exception {
        mvc.perform(put("/api/employees/{id}", 999_999_999L).contentType(APPLICATION_JSON)
                        .content(updateBody("Ghost", "STAFF", 0)))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString("999999999")));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=EmployeeOptimisticLockTest+UpdateEmployeeApiTest`
Expected: FAIL — `UpdateEmployeeRequest` does not exist; `PUT` is unmapped.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/employee/dto/UpdateEmployeeRequest.java`
```java
package com.payscope.employee.dto;

import com.payscope.employee.Department;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Employee fields only. Salary changes go through POST /employees/{id}/salary,
 * which guards a different row with a different token.
 */
public record UpdateEmployeeRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotNull Department department,
        @NotNull Role role,
        @NotNull Level level,
        @NotNull EmploymentType employmentType,
        @NotNull Long employeeVersion) {
}
```

`src/main/java/com/payscope/employee/EmployeeService.java` — add:
```java
// add to imports
import com.payscope.employee.dto.UpdateEmployeeRequest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

    @Transactional
    public EmployeeDetailResponse update(Long id, UpdateEmployeeRequest request) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));

        if (!employee.version().equals(request.employeeVersion())) {
            throw new ObjectOptimisticLockingFailureException(Employee.class, id);
        }

        employee.rename(request.fullName());
        employee.changeEmail(request.email());
        employee.reassign(request.department(), request.role(), request.level(), request.employmentType());
        employees.saveAndFlush(employee);

        return detail(id);
    }
```

`src/main/java/com/payscope/employee/EmployeeController.java` — add:
```java
// add to imports
import com.payscope.employee.dto.UpdateEmployeeRequest;
import org.springframework.web.bind.annotation.PutMapping;

    @PutMapping("/{id}")
    EmployeeDetailResponse update(@PathVariable Long id, @Valid @RequestBody UpdateEmployeeRequest request) {
        return service.update(id, request);
    }
```

`src/main/java/com/payscope/common/ApiExceptionHandler.java` — replace `onStaleVersion` so the client learns the current version:
```java
    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail onStaleVersion(OptimisticLockingFailureException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        problem.setDetail("This record changed since you loaded it. Reload and try again.");
        if (e instanceof ObjectOptimisticLockingFailureException lock && lock.getIdentifier() != null) {
            problem.setProperty("conflictedId", lock.getIdentifier());
        }
        return problem;
    }
```

This alone does not carry `currentVersion`. Add a dedicated exception so the service can report it:

`src/main/java/com/payscope/common/StaleVersionException.java`
```java
package com.payscope.common;

import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * Carries the version the client should refresh to, so recovering from a 409
 * needs no second round trip - spec section 7.
 */
public class StaleVersionException extends ObjectOptimisticLockingFailureException {

    private final long currentVersion;

    public StaleVersionException(Class<?> type, Object identifier, long currentVersion) {
        super(type, identifier);
        this.currentVersion = currentVersion;
    }

    public long currentVersion() {
        return currentVersion;
    }
}
```

Then in `EmployeeService.update`, throw `new StaleVersionException(Employee.class, id, employee.version())`, and in the handler add:
```java
        if (e instanceof StaleVersionException stale) {
            problem.setProperty("currentVersion", stale.currentVersion());
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=EmployeeOptimisticLockTest+UpdateEmployeeApiTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Remove the stray `employees.getClass();` line from `EmployeeOptimisticLockTest` and re-run**

Run: `./mvnw test -Dtest=EmployeeOptimisticLockTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/payscope/employee src/main/java/com/payscope/common \
        src/test/java/com/payscope/employee
git commit -m "feat: guard employee updates with an optimistic lock

A stale employeeVersion returns 409 carrying the current version, so the
client can refresh without a second round trip. The lost-update test uses
two detached copies rather than racing threads, which makes the exact
interleaving reproducible on every run."
```

---

### Task 11: Deactivation and soft delete, both idempotent, neither versioned

Implements ADR-0005 and the version-free transitions from ADR-0007. The interaction between idempotency and optimistic locking is the reason these carry no version — re-read spec §7 before changing it.

**Files:**
- Modify: `src/main/java/com/payscope/employee/EmployeeService.java` (add `deactivate`, `softDelete`)
- Modify: `src/main/java/com/payscope/employee/EmployeeController.java`
- Test: `src/test/java/com/payscope/employee/DeactivateAndDeleteApiTest.java`

**Interfaces:**
- Produces:
  - `EmployeeService.deactivate(Long id)` → `EmployeeDetailResponse`; idempotent.
  - `EmployeeService.softDelete(Long id)` → `void`; idempotent, never throws for an already-deleted id.
  - `POST /api/employees/{id}/deactivate` → `200`; `DELETE /api/employees/{id}` → `204`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/employee/DeactivateAndDeleteApiTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class DeactivateAndDeleteApiTest {

    @Autowired
    MockMvc mvc;

    private long create(String number, String email) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email)))
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    @Test
    void deactivating_marks_the_employee_inactive_but_leaves_the_record_readable() throws Exception {
        long id = create("E-6001", "x1@acme.test");

        mvc.perform(post("/api/employees/{id}/deactivate", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    void deactivating_an_already_inactive_employee_succeeds_again() throws Exception {
        long id = create("E-6002", "x2@acme.test");
        mvc.perform(post("/api/employees/{id}/deactivate", id));

        mvc.perform(post("/api/employees/{id}/deactivate", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    void deleting_returns_no_content_and_hides_the_record() throws Exception {
        long id = create("E-6003", "x3@acme.test");

        mvc.perform(delete("/api/employees/{id}", id))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleting_twice_returns_no_content_both_times() throws Exception {
        // Idempotent: the end state is identical, so the retry must report success.
        // A retry reporting failure for work that already succeeded is how
        // double-submits get invented - spec section 7.
        long id = create("E-6004", "x4@acme.test");
        mvc.perform(delete("/api/employees/{id}", id)).andExpect(status().isNoContent());

        mvc.perform(delete("/api/employees/{id}", id))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleting_an_id_that_never_existed_also_returns_no_content() throws Exception {
        mvc.perform(delete("/api/employees/{id}", 999_999_999L))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleting_frees_the_email_address_for_a_new_employee() throws Exception {
        long id = create("E-6005", "reusable@acme.test");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "E-6006", "fullName": "Second Person",
                          "email": "reusable@acme.test", "department": "ENGINEERING",
                          "countryCode": "IN", "role": "SOFTWARE_ENGINEER", "level": "SENIOR",
                          "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """))
                .andExpect(status().isCreated());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=DeactivateAndDeleteApiTest`
Expected: FAIL — neither endpoint is mapped.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/employee/EmployeeService.java` — add:
```java
    /**
     * The person left the company. The record stays visible and keeps counting
     * in analytics, because last year's payroll legitimately includes leavers.
     * Idempotent, and takes no version: this is a transition to a fixed target
     * state, not a read-modify-write, so there is no lost update to prevent.
     */
    @Transactional
    public EmployeeDetailResponse deactivate(Long id) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));
        employee.deactivate();
        employees.saveAndFlush(employee);
        return detail(id);
    }

    /**
     * The record should not exist. Idempotent: deleting an already-deleted or
     * never-existing id succeeds, because the end state is what was asked for.
     */
    @Transactional
    public void softDelete(Long id) {
        employees.findByIdAndDeletedAtIsNull(id).ifPresent(employee -> {
            employee.softDelete(clock.instant());
            employees.saveAndFlush(employee);
        });
    }
```

`src/main/java/com/payscope/employee/EmployeeController.java` — add:
```java
// add to imports
import org.springframework.web.bind.annotation.DeleteMapping;

    @PostMapping("/{id}/deactivate")
    EmployeeDetailResponse deactivate(@PathVariable Long id) {
        return service.deactivate(id);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable Long id) {
        service.softDelete(id);
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=DeactivateAndDeleteApiTest`
Expected: PASS — 6 tests.

- [ ] **Step 5: Re-enable the soft-delete test in Task 9**

Remove the `@Disabled` annotation from `EmployeeDetailApiTest.returns_not_found_rather_than_gone_for_a_soft_deleted_employee` if you added one.

Run: `./mvnw test -Dtest=EmployeeDetailApiTest`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/payscope/employee src/test/java/com/payscope/employee
git commit -m "feat: add idempotent deactivation and soft delete

Neither takes a version. Both are transitions to a fixed target state
rather than read-modify-write, so no lost update exists to prevent, and
requiring a version would make a retry conflict with the first call and
break idempotency."
```

---

### Task 12: The employee list — projection query, pagination, and the N+1 guard

The hot path. Implements spec §4, §6 and the list half of §8. This task is where the N+1 defence is built *and proven*.

**Why a hand-written native query rather than Spring Data derivation:** the list needs employee, salary and pay band in one statement, a validated dynamic sort, and — critically — it must be executed *by Hibernate* so `Statistics` can count it. A `JdbcTemplate` query would bypass Hibernate entirely and the query-count assertion would silently measure nothing.

**Files:**
- Create: `src/main/java/com/payscope/common/PagedResponse.java`
- Create: `src/main/java/com/payscope/employee/EmployeeSort.java`, `EmployeeQuery.java`, `EmployeeListRepository.java`
- Create: `src/main/java/com/payscope/employee/dto/EmployeeListItem.java`
- Modify: `src/main/java/com/payscope/employee/EmployeeService.java` (add `search`)
- Modify: `src/main/java/com/payscope/employee/EmployeeController.java` (add `GET /`)
- Create: `src/test/java/com/payscope/support/QueryCounter.java`
- Test: `src/test/java/com/payscope/employee/EmployeeListApiTest.java`
- Test: `src/test/java/com/payscope/employee/EmployeeListQueryCountTest.java`

**Interfaces:**
- Produces:
  - `PagedResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages)`
  - `EmployeeSort` enum: `FULL_NAME`, `HIRE_DATE`, `SALARY`, `COUNTRY`, `DEPARTMENT`, `LEVEL`, `COMPA_RATIO`
  - `EmployeeQuery(String country, Department department, Level level, EmployeeStatus status, String q, int page, int size, EmployeeSort sort, boolean ascending)`
  - `EmployeeListRepository.search(EmployeeQuery)` → `PagedResponse<EmployeeListItem>`
  - `EmployeeService.search(EmployeeQuery)` → `PagedResponse<EmployeeListItem>`
  - `QueryCounter.countStatements(Runnable)` → `long`

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/support/QueryCounter.java`
```java
package com.payscope.support;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.stereotype.Component;

/**
 * Counts JDBC statements Hibernate prepares while a block runs. Requires
 * hibernate.generate_statistics, enabled in the test profile only.
 */
@Component
public class QueryCounter {

    private final Statistics statistics;

    public QueryCounter(EntityManagerFactory emf) {
        this.statistics = emf.unwrap(SessionFactory.class).getStatistics();
    }

    public long countStatements(Runnable work) {
        statistics.clear();
        work.run();
        return statistics.getPrepareStatementCount();
    }
}
```

`src/test/java/com/payscope/employee/EmployeeListQueryCountTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import com.payscope.support.QueryCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import com.payscope.common.MoneyDto;
import com.payscope.employee.dto.CreateEmployeeRequest;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The regression guard for N+1. A future lazy traversal reintroducing per-row
 * queries fails here with a number, rather than quietly costing 300 round trips.
 */
@IntegrationTest
@Import(FixedClockConfig.class)
class EmployeeListQueryCountTest {

    @Autowired
    EmployeeService service;

    @Autowired
    QueryCounter queries;

    @BeforeEach
    void seedOneHundredAndTwentyEmployees() {
        for (int i = 0; i < 120; i++) {
            service.create(new CreateEmployeeRequest(
                    "QC-%04d".formatted(i), "Person %04d".formatted(i), "qc%04d@acme.test".formatted(i),
                    Department.ENGINEERING, "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR,
                    EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1),
                    new MoneyDto("3712500.00", "INR"), LocalDate.of(2024, 3, 1)));
        }
    }

    private EmployeeQuery pageOf(int size) {
        return new EmployeeQuery(null, null, null, null, null, 0, size, EmployeeSort.FULL_NAME, true);
    }

    @Test
    void reads_a_page_of_ten_employees_in_exactly_two_statements() {
        long statements = queries.countStatements(() -> service.search(pageOf(10)));

        assertThat(statements).isEqualTo(2);
    }

    @Test
    void reads_a_page_of_one_hundred_employees_in_exactly_the_same_two_statements() {
        // Independence from page size is the whole point: one projection query
        // plus one count query, never one per row.
        long statements = queries.countStatements(() -> service.search(pageOf(100)));

        assertThat(statements).isEqualTo(2);
    }

    @Test
    void returns_salary_and_compa_ratio_on_every_row_without_a_further_query() {
        PagedResponseAssertions.assertRowsArePopulated(service.search(pageOf(100)));
    }

    /** Kept separate so the query-count assertions above stay unambiguous. */
    static class PagedResponseAssertions {
        static void assertRowsArePopulated(com.payscope.common.PagedResponse<
                com.payscope.employee.dto.EmployeeListItem> page) {
            assertThat(page.content()).hasSize(100);
            assertThat(page.content()).allSatisfy(row -> {
                assertThat(row.salary().amount()).isEqualTo("3712500.00");
                assertThat(row.salaryBaseUsd().amount()).isEqualTo("44550.00");
                assertThat(row.compaRatio()).isEqualByComparingTo("1.0000");
            });
        }
    }
}
```

`src/test/java/com/payscope/employee/EmployeeListApiTest.java`
```java
package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class EmployeeListApiTest {

    @Autowired
    MockMvc mvc;

    private void create(String number, String name, String email, String country, String currency,
                        String amount, String department, String level) throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                {
                  "employeeNumber": "%s", "fullName": "%s", "email": "%s",
                  "department": "%s", "countryCode": "%s", "role": "SOFTWARE_ENGINEER",
                  "level": "%s", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                  "salary": { "amount": "%s", "currency": "%s" },
                  "salaryEffectiveFrom": "2024-03-01"
                }
                """.formatted(number, name, email, department, country, level, amount, currency)))
                .andExpect(status().isCreated());
    }

    @BeforeEach
    void seed() throws Exception {
        create("L-001", "Asha Menon",  "l1@acme.test", "IN", "INR", "3712500.00", "ENGINEERING", "SENIOR");
        create("L-002", "Ben Carter",  "l2@acme.test", "GB", "GBP", "100000.00",  "ENGINEERING", "MID");
        create("L-003", "Chen Wei",    "l3@acme.test", "SG", "SGD", "120000.00",  "SALES",       "SENIOR");
        create("L-004", "Dana Silva",  "l4@acme.test", "BR", "BRL", "300000.00",  "SALES",       "JUNIOR");
    }

    @Test
    void returns_the_first_page_sorted_by_name_with_page_metadata() throws Exception {
        mvc.perform(get("/api/employees").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].fullName").value("Asha Menon"))
                .andExpect(jsonPath("$.content[1].fullName").value("Ben Carter"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void filters_by_country() throws Exception {
        mvc.perform(get("/api/employees").param("country", "IN"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].countryCode").value("IN"));
    }

    @Test
    void filters_by_department_and_level_together() throws Exception {
        mvc.perform(get("/api/employees").param("department", "SALES").param("level", "SENIOR"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].fullName").value("Chen Wei"));
    }

    @Test
    void searches_across_name_email_and_employee_number_case_insensitively() throws Exception {
        mvc.perform(get("/api/employees").param("q", "carter"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].fullName").value("Ben Carter"));

        mvc.perform(get("/api/employees").param("q", "L-003"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void sorts_by_base_salary_descending_so_the_comparison_is_currency_neutral() throws Exception {
        // Base USD: Asha 44550, Ben 127000, Chen 88800, Dana 57000
        mvc.perform(get("/api/employees").param("sort", "SALARY").param("direction", "desc"))
                .andExpect(jsonPath("$.content[0].fullName").value("Ben Carter"))
                .andExpect(jsonPath("$.content[1].fullName").value("Chen Wei"));
    }

    @Test
    void excludes_soft_deleted_employees_from_the_list() throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "L-005", "fullName": "Erased Person", "email": "l5@acme.test",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """)).andReturn().getResponse().getHeader("Location");
        mvc.perform(delete(location)).andExpect(status().isNoContent());

        mvc.perform(get("/api/employees").param("q", "Erased"))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void includes_inactive_employees_unless_the_status_filter_excludes_them() throws Exception {
        mvc.perform(post("/api/employees/{id}/deactivate", idOf("l2@acme.test")));

        mvc.perform(get("/api/employees"))
                .andExpect(jsonPath("$.totalElements").value(4));
        mvc.perform(get("/api/employees").param("status", "ACTIVE"))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void rejects_a_page_size_above_one_hundred_rather_than_clamping_it() throws Exception {
        mvc.perform(get("/api/employees").param("size", "500"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("100")));
    }

    @Test
    void rejects_a_page_size_below_one() throws Exception {
        mvc.perform(get("/api/employees").param("size", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejects_a_sort_field_that_is_not_on_the_whitelist() throws Exception {
        mvc.perform(get("/api/employees").param("sort", "email; drop table employee"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("FULL_NAME")));
    }

    @Test
    void rejects_an_unknown_level_filter_and_lists_the_permitted_values() throws Exception {
        mvc.perform(get("/api/employees").param("level", "ARCHMAGE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("SENIOR")));
    }

    /** Resolves an employee id by email through the list endpoint. */
    private long idOf(String email) throws Exception {
        String body = mvc.perform(get("/api/employees").param("q", email))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        return Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=EmployeeListApiTest+EmployeeListQueryCountTest`
Expected: FAIL — `EmployeeQuery`, `EmployeeSort`, `PagedResponse` do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/common/PagedResponse.java`
```java
package com.payscope.common;

import java.util.List;

/**
 * Deliberately not a serialized Spring PageImpl: Spring Data declines to treat
 * that shape as a stable contract, and its JSON leaks Pageable internals.
 */
public record PagedResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PagedResponse<T> of(List<T> content, int page, int size, long totalElements) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) totalElements / size);
        return new PagedResponse<>(content, page, size, totalElements, totalPages);
    }
}
```

`src/main/java/com/payscope/employee/EmployeeSort.java`
```java
package com.payscope.employee;

import com.payscope.common.DomainException;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * The closed whitelist of sortable columns. The list runs as a native query, so
 * an unvalidated sort field would be a SQL injection vector - spec section 6.
 */
public enum EmployeeSort {

    FULL_NAME("e.full_name"),
    HIRE_DATE("e.hire_date"),
    SALARY("s.amount_base_usd"),
    COUNTRY("e.country_code"),
    DEPARTMENT("e.department"),
    LEVEL("e.job_level"),
    COMPA_RATIO("compa_ratio");

    private final String column;

    EmployeeSort(String column) {
        this.column = column;
    }

    public String column() {
        return column;
    }

    public static EmployeeSort parse(String value) {
        if (value == null || value.isBlank()) {
            return FULL_NAME;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("Cannot sort by '" + value + "'. Permitted values: "
                    + Arrays.stream(values()).map(Enum::name).collect(Collectors.joining(", ")));
        }
    }
}
```

`src/main/java/com/payscope/employee/EmployeeQuery.java`
```java
package com.payscope.employee;

import com.payscope.common.DomainException;

public record EmployeeQuery(String country, Department department, Level level, EmployeeStatus status,
                            String q, int page, int size, EmployeeSort sort, boolean ascending) {

    public static final int MAX_SIZE = 100;

    public EmployeeQuery {
        if (page < 0) {
            throw new DomainException("Page must not be negative");
        }
        // A client asking for 500 rows has a bug. Quietly returning 100 hides it.
        if (size < 1 || size > MAX_SIZE) {
            throw new DomainException("Page size must be between 1 and " + MAX_SIZE + ", was " + size);
        }
    }

    public int offset() {
        return page * size;
    }
}
```

`src/main/java/com/payscope/employee/dto/EmployeeListItem.java`
```java
package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EmployeeListItem(
        Long id,
        String employeeNumber,
        String fullName,
        String email,
        String department,
        String countryCode,
        String role,
        String level,
        String status,
        MoneyDto salary,
        MoneyDto salaryBaseUsd,
        BigDecimal compaRatio) {
}
```

`src/main/java/com/payscope/employee/EmployeeListRepository.java`
```java
package com.payscope.employee;

import com.payscope.common.MoneyDto;
import com.payscope.common.PagedResponse;
import com.payscope.employee.dto.EmployeeListItem;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

/**
 * The list endpoint loads no entities. One projection query joins employee,
 * salary and pay_band; one count query follows. Two statements per page,
 * constant in page size - spec section 4.
 *
 * Executed through the EntityManager rather than JdbcTemplate so Hibernate's
 * Statistics can count it: a JdbcTemplate query would bypass Hibernate and the
 * N+1 regression test would silently measure nothing.
 */
@Repository
public class EmployeeListRepository {

    private static final String FROM_AND_WHERE = """
            from employee e
            join salary s on s.employee_id = e.id
            left join pay_band b on b.job_role = e.job_role
                                and b.job_level = e.job_level
                                and b.country_code = e.country_code
            where e.deleted_at is null
              and (:country    is null or e.country_code   = :country)
              and (:department is null or e.department     = :department)
              and (:level      is null or e.job_level      = :level)
              and (:status     is null or e.status         = :status)
              and (:q is null or e.full_name ilike :like
                              or e.email ilike :like
                              or e.employee_number ilike :like)
            """;

    private final EntityManager em;

    public EmployeeListRepository(EntityManager em) {
        this.em = em;
    }

    public PagedResponse<EmployeeListItem> search(EmployeeQuery query) {
        String direction = query.ascending() ? "asc" : "desc";

        // The sort column comes from a closed enum, never from user text, and the
        // id tiebreaker is mandatory: without a unique final key, rows sharing a
        // sort value can appear on two pages or be skipped entirely.
        String sql = """
                select e.id, e.employee_number, e.full_name, e.email, e.department, e.country_code,
                       e.job_role, e.job_level, e.status,
                       s.amount_original, s.currency_code, s.amount_base_usd,
                       case when b.band_mid is null then null
                            else round(s.amount_original / b.band_mid, 4) end as compa_ratio
                """ + FROM_AND_WHERE + """
                order by %s %s, e.id asc
                limit :size offset :offset
                """.formatted(query.sort().column(), direction);

        Query rows = bind(em.createNativeQuery(sql, Tuple.class), query)
                .setParameter("size", query.size())
                .setParameter("offset", query.offset());

        @SuppressWarnings("unchecked")
        List<Tuple> tuples = rows.getResultList();

        Number total = (Number) bind(em.createNativeQuery("select count(*) " + FROM_AND_WHERE), query)
                .getSingleResult();

        List<EmployeeListItem> content = tuples.stream().map(EmployeeListRepository::toItem).toList();
        return PagedResponse.of(content, query.page(), query.size(), total.longValue());
    }

    private Query bind(Query query, EmployeeQuery q) {
        return query
                .setParameter("country", q.country())
                .setParameter("department", q.department() == null ? null : q.department().name())
                .setParameter("level", q.level() == null ? null : q.level().name())
                .setParameter("status", q.status() == null ? null : q.status().name())
                .setParameter("q", q.q())
                .setParameter("like", q.q() == null ? null : "%" + q.q() + "%");
    }

    private static EmployeeListItem toItem(Tuple t) {
        BigDecimal compaRatio = t.get("compa_ratio", BigDecimal.class);
        return new EmployeeListItem(
                ((Number) t.get("id")).longValue(),
                t.get("employee_number", String.class),
                t.get("full_name", String.class),
                t.get("email", String.class),
                t.get("department", String.class),
                t.get("country_code", String.class),
                t.get("job_role", String.class),
                t.get("job_level", String.class),
                t.get("status", String.class),
                new MoneyDto(t.get("amount_original", BigDecimal.class).toPlainString(),
                        t.get("currency_code", String.class)),
                new MoneyDto(t.get("amount_base_usd", BigDecimal.class).toPlainString(), "USD"),
                compaRatio);
    }
}
```

`src/main/java/com/payscope/employee/EmployeeService.java` — add:
```java
// add to imports
import com.payscope.common.PagedResponse;
import com.payscope.employee.dto.EmployeeListItem;

// add EmployeeListRepository listRepository to the constructor and field list

    @Transactional(readOnly = true)
    public PagedResponse<EmployeeListItem> search(EmployeeQuery query) {
        return listRepository.search(query);
    }
```

`src/main/java/com/payscope/employee/EmployeeController.java` — add:
```java
// add to imports
import com.payscope.common.PagedResponse;
import com.payscope.employee.dto.EmployeeListItem;
import org.springframework.web.bind.annotation.RequestParam;

    @GetMapping
    PagedResponse<EmployeeListItem> list(
            @RequestParam(required = false) String country,
            @RequestParam(required = false) Department department,
            @RequestParam(required = false) Level level,
            @RequestParam(required = false) EmployeeStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "asc") String direction) {

        return service.search(new EmployeeQuery(country, department, level, status, q, page, size,
                EmployeeSort.parse(sort), !"desc".equalsIgnoreCase(direction)));
    }
}
```

An unparseable `level` or `status` query parameter arrives as `MethodArgumentTypeMismatchException`, already mapped to 400 in Task 8. Improve that message so it lists the permitted values:

`src/main/java/com/payscope/common/ApiExceptionHandler.java` — replace `onBadParameter`:
```java
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail onBadParameter(MethodArgumentTypeMismatchException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Invalid parameter");

        Class<?> required = e.getRequiredType();
        if (required != null && required.isEnum()) {
            String permitted = java.util.Arrays.stream(required.getEnumConstants())
                    .map(Object::toString).collect(java.util.stream.Collectors.joining(", "));
            problem.setDetail("'" + e.getValue() + "' is not a valid " + e.getName()
                    + ". Permitted values: " + permitted);
        } else {
            problem.setDetail("'" + e.getValue() + "' is not a valid " + e.getName());
        }
        return problem;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=EmployeeListApiTest+EmployeeListQueryCountTest`
Expected: PASS — 11 + 3 tests. If the query-count tests report more than 2, something is loading entities; find it before moving on rather than relaxing the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope src/test/java/com/payscope
git commit -m "feat: add server-side employee list with a projection query

The list loads no entities: one projection query joining employee, salary
and pay_band, plus one count query. Query-count tests assert exactly two
statements at page size 10 and again at 100, so independence from row
count is demonstrated rather than claimed.

Sort columns come from a closed enum and every page carries an id
tiebreaker, without which rows sharing a sort value can appear twice or
be skipped while paging."
```

---

### Task 13: Recording a raise

Implements spec §8 salary endpoints and the concurrency work in ADR-0007. Two writes in one transaction, plus the `FOR SHARE` lock that closes the delete-racing-a-raise window.

**Files:**
- Create: `src/main/java/com/payscope/salary/dto/RecordSalaryRequest.java`, `SalaryResponse.java`
- Create: `src/main/java/com/payscope/salary/SalaryService.java`, `SalaryController.java`
- Modify: `src/main/java/com/payscope/employee/EmployeeRepository.java` (add `findByIdForShare`)
- Test: `src/test/java/com/payscope/salary/RecordSalaryApiTest.java`

**Interfaces:**
- Consumes: `Salary.replaceWith` (Task 6), `CurrencyConverter` (Task 3), `StaleVersionException` (Task 10).
- Produces:
  - `EmployeeRepository.findByIdForShare(Long id)` → `Optional<Employee>` holding a `FOR SHARE` lock.
  - `SalaryService.recordRaise(Long employeeId, RecordSalaryRequest)` → `SalaryResponse`.
  - `SalaryResponse(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom, BigDecimal compaRatio, Long salaryVersion)`.
  - `POST /api/employees/{id}/salary` → `200`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/salary/RecordSalaryApiTest.java`
```java
package com.payscope.salary;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class RecordSalaryApiTest {

    @Autowired
    MockMvc mvc;

    private long create(String number, String email) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email)))
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    private String raiseBody(String amount, String currency, String effectiveFrom, long version) {
        return """
                {
                  "salary": { "amount": "%s", "currency": "%s" },
                  "effectiveFrom": "%s",
                  "changeReason": "Annual review",
                  "salaryVersion": %d
                }
                """.formatted(amount, currency, effectiveFrom, version);
    }

    @Test
    void replaces_the_current_salary_and_returns_the_new_figures() throws Exception {
        long id = create("R-001", "r1@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salary.amount").value("4640625.00"))
                .andExpect(jsonPath("$.salaryBaseUsd.amount").value("55687.50"))
                .andExpect(jsonPath("$.compaRatio").value(1.2500))
                .andExpect(jsonPath("$.salaryVersion").value(1));
    }

    @Test
    void archives_the_superseded_salary_with_its_own_effective_period() throws Exception {
        long id = create("R-002", "r2@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)));

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].salary.amount").value("3712500.00"))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2024-03-01"))
                .andExpect(jsonPath("$[0].effectiveTo").value("2026-01-01"))
                .andExpect(jsonPath("$[0].changeReason").value("Annual review"));
    }

    @Test
    void rejects_a_replayed_request_carrying_the_version_it_already_consumed() throws Exception {
        // The optimistic-lock token doubles as an idempotency key: applying a
        // raise twice is the expensive mistake, and this closes it - ADR-0007.
        long id = create("R-003", "r3@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)));

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void rejects_a_raise_denominated_in_a_currency_the_country_does_not_use() throws Exception {
        long id = create("R-004", "r4@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("80000.00", "GBP", "2026-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("INR")));
    }

    @Test
    void rejects_an_effective_date_that_is_not_after_the_current_salarys_own() throws Exception {
        long id = create("R-005", "r5@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2024-03-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("after")));
    }

    @Test
    void rejects_an_effective_date_in_the_future() throws Exception {
        long id = create("R-006", "r6@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2027-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("future")));
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() throws Exception {
        long id = create("R-007", "r7@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("0.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("positive")));
    }

    @Test
    void requires_a_salary_version_on_every_raise() throws Exception {
        long id = create("R-008", "r8@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON).content("""
                        {
                          "salary": { "amount": "4640625.00", "currency": "INR" },
                          "effectiveFrom": "2026-01-01", "changeReason": "No version"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("salaryVersion"));
    }

    @Test
    void returns_not_found_when_raising_a_soft_deleted_employee() throws Exception {
        long id = create("R-009", "r9@acme.test");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString(String.valueOf(id))));
    }

    @Test
    void returns_an_empty_history_for_an_employee_who_has_never_had_a_raise() throws Exception {
        long id = create("R-010", "r10@acme.test");

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void lists_multiple_raises_most_recent_first() throws Exception {
        long id = create("R-011", "r11@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4000000.00", "INR", "2025-01-01", 0)));
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 1)));

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].effectiveTo").value("2026-01-01"))
                .andExpect(jsonPath("$[1].effectiveTo").value("2025-01-01"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=RecordSalaryApiTest`
Expected: FAIL — neither salary endpoint is mapped.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/employee/EmployeeRepository.java` — add:
```java
// add to imports
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

    /**
     * PESSIMISTIC_READ maps to SELECT ... FOR SHARE on Postgres. A raise and a
     * soft delete touch different rows with different version columns, so they
     * do not naturally contend; this lock blocks a concurrent delete until the
     * raise commits - ADR-0007.
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select e from Employee e where e.id = :id and e.deletedAt is null")
    Optional<Employee> findByIdForShare(@Param("id") Long id);
```

`src/main/java/com/payscope/salary/dto/RecordSalaryRequest.java`
```java
package com.payscope.salary.dto;

import com.payscope.common.MoneyDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record RecordSalaryRequest(
        @NotNull @Valid MoneyDto salary,
        @NotNull LocalDate effectiveFrom,
        @Size(max = 200) String changeReason,
        @NotNull Long salaryVersion) {
}
```

`src/main/java/com/payscope/salary/dto/SalaryResponse.java`
```java
package com.payscope.salary.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalaryResponse(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom,
                             BigDecimal compaRatio, Long salaryVersion) {
}
```

`src/main/java/com/payscope/salary/dto/SalaryHistoryItem.java`
```java
package com.payscope.salary.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalaryHistoryItem(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom,
                                LocalDate effectiveTo, String changeReason) {
}
```

`src/main/java/com/payscope/salary/SalaryService.java`
```java
package com.payscope.salary;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.NotFoundException;
import com.payscope.common.StaleVersionException;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.Employee;
import com.payscope.employee.EmployeeRepository;
import com.payscope.salary.dto.RecordSalaryRequest;
import com.payscope.salary.dto.SalaryHistoryItem;
import com.payscope.salary.dto.SalaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

@Service
public class SalaryService {

    private final EmployeeRepository employees;
    private final SalaryRepository salaries;
    private final SalaryHistoryRepository history;
    private final PayBandRepository bands;
    private final CountryRepository countries;
    private final CurrencyConverter converter;
    private final Clock clock;

    public SalaryService(EmployeeRepository employees, SalaryRepository salaries,
                         SalaryHistoryRepository history, PayBandRepository bands,
                         CountryRepository countries, CurrencyConverter converter, Clock clock) {
        this.employees = employees;
        this.salaries = salaries;
        this.history = history;
        this.bands = bands;
        this.countries = countries;
        this.converter = converter;
        this.clock = clock;
    }

    /**
     * Closes the current salary into history and installs the new one. Both
     * writes happen here, in one transaction, deriving the history row from the
     * row being replaced - ADR-0004.
     */
    @Transactional
    public SalaryResponse recordRaise(Long employeeId, RecordSalaryRequest request) {
        Employee employee = employees.findByIdForShare(employeeId)
                .orElseThrow(() -> new NotFoundException("No employee with id " + employeeId));

        Salary current = salaries.findByEmployeeId(employeeId)
                .orElseThrow(() -> new IllegalStateException(
                        "Employee " + employeeId + " has no current salary, which creation makes impossible"));

        if (!current.version().equals(request.salaryVersion())) {
            throw new StaleVersionException(Salary.class, employeeId, current.version());
        }

        Country country = countries.findById(employee.countryCode()).orElseThrow();
        Money amount = request.salary().toMoney();
        LocalDate today = LocalDate.now(clock);

        if (!amount.currencyCode().equals(country.currencyCode())) {
            throw new DomainException("Employees in " + country.countryCode() + " are paid in "
                    + country.currencyCode() + ", not " + amount.currencyCode());
        }
        if (!amount.isPositive()) {
            throw new DomainException("Salary must be strictly positive");
        }
        if (!request.effectiveFrom().isAfter(current.effectiveFrom())) {
            throw new DomainException("A new salary must take effect after the current one, which began "
                    + current.effectiveFrom());
        }
        if (request.effectiveFrom().isAfter(today)) {
            throw new DomainException("Effective date " + request.effectiveFrom() + " is in the future");
        }

        ConversionResult converted = converter.toUsd(amount, request.effectiveFrom());
        SalaryHistory archived = current.replaceWith(amount, converted, request.effectiveFrom());
        archived.recordReason(request.changeReason());

        history.saveAndFlush(archived);
        salaries.saveAndFlush(current);

        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                employee.role(), employee.level(), employee.countryCode()).orElse(null);

        return new SalaryResponse(MoneyDto.from(current.original()), MoneyDto.from(current.baseUsd()),
                current.effectiveFrom(),
                CompaRatio.of(current.original(), band == null ? null : band.mid()),
                current.version());
    }

    @Transactional(readOnly = true)
    public List<SalaryHistoryItem> historyFor(Long employeeId) {
        employees.findByIdAndDeletedAtIsNull(employeeId)
                .orElseThrow(() -> new NotFoundException("No employee with id " + employeeId));

        return history.findByEmployeeIdOrderByEffectiveToDesc(employeeId).stream()
                .map(row -> new SalaryHistoryItem(MoneyDto.from(row.original()),
                        MoneyDto.from(row.baseUsd()), row.effectiveFrom(), row.effectiveTo(),
                        row.changeReason()))
                .toList();
    }
}
```

`src/main/java/com/payscope/salary/SalaryController.java`
```java
package com.payscope.salary;

import com.payscope.salary.dto.RecordSalaryRequest;
import com.payscope.salary.dto.SalaryHistoryItem;
import com.payscope.salary.dto.SalaryResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/employees/{id}")
public class SalaryController {

    private final SalaryService service;

    public SalaryController(SalaryService service) {
        this.service = service;
    }

    /**
     * 200, not 201: /employees/{id}/salary is a singleton that was replaced. The
     * history row it produces is not separately addressable, so a Location
     * header would be fiction - spec section 8.
     */
    @PostMapping("/salary")
    SalaryResponse recordRaise(@PathVariable Long id, @Valid @RequestBody RecordSalaryRequest request) {
        return service.recordRaise(id, request);
    }

    @GetMapping("/salary-history")
    List<SalaryHistoryItem> history(@PathVariable Long id) {
        return service.historyFor(id);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=RecordSalaryApiTest`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope src/test/java/com/payscope/salary/RecordSalaryApiTest.java
git commit -m "feat: record a raise and archive the superseded salary

Both writes happen in one transaction, with the history row derived from
the row being replaced. A replayed request carries the version it already
consumed and is rejected, so the optimistic-lock token doubles as an
idempotency key for the operation where a double-apply is expensive.

The employee row is read FOR SHARE, which blocks a concurrent soft delete
until the raise commits: the two otherwise touch different rows with
different version columns and would not contend at all."
```

---

### Task 14: The analytics fixture, test isolation, and `/analytics/summary`

Implements spec §8 summary and §12's exact-value testing rule. The fixture is the centre of gravity for every analytics test that follows — build it carefully, because Tasks 15 and 16 assert against the same numbers.

**A problem this task must fix first.** Analytics assertions are counts and totals over the whole table, so they are corrupted by rows other test classes committed. Task 12's list tests have the same exposure (`totalElements` is a global count) and were written without it. This task introduces `DatabaseCleaner` and retrofits them.

**The fixture — 12 employees, every figure hand-computed:**

| # | Country | Currency | Role / Level | Original | Base USD | Band mid | Compa-ratio |
|---|---|---|---|---|---|---|---|
| G1 | DE | EUR | SOFTWARE_ENGINEER / SENIOR | 88 000 | 95 040.00 | 110 000 | 0.8000 |
| G2 | DE | EUR | SOFTWARE_ENGINEER / SENIOR | 99 000 | 106 920.00 | 110 000 | 0.9000 |
| G3 | DE | EUR | SOFTWARE_ENGINEER / SENIOR | 121 000 | 130 680.00 | 110 000 | 1.1000 |
| G4 | DE | EUR | SOFTWARE_ENGINEER / SENIOR | 132 000 | 142 560.00 | 110 000 | 1.2000 |
| U1 | US | USD | SOFTWARE_ENGINEER / SENIOR | 103 950 | 103 950.00 | 148 500 | 0.7000 |
| U2 | US | USD | SOFTWARE_ENGINEER / SENIOR | 148 500 | 148 500.00 | 148 500 | 1.0000 |
| U3 | US | USD | SOFTWARE_ENGINEER / SENIOR | 148 500 | 148 500.00 | 148 500 | 1.0000 |
| U4 | US | USD | SOFTWARE_ENGINEER / SENIOR | 193 050 | 193 050.00 | 148 500 | 1.3000 |
| I1 | IN | INR | SOFTWARE_ENGINEER / SENIOR | 2 970 000 | 35 640.00 | 3 712 500 | 0.8000 |
| I2 | IN | INR | SOFTWARE_ENGINEER / SENIOR | 3 712 500 | 44 550.00 | 3 712 500 | 1.0000 |
| I3 | IN | INR | SOFTWARE_ENGINEER / SENIOR | 4 640 625 | 55 687.50 | 3 712 500 | 1.2500 |
| N1 | US | USD | RECRUITER / **PRINCIPAL** | 200 000 | 200 000.00 | *none* | *null* |

Three properties are deliberate:
- **The German group has an even number of members**, so `percentile_cont`'s interpolation is pinned by a test: its p50 is 118 800, the mean of 106 920 and 130 680, a figure no employee earns.
- **Grouping by level alone mixes three currencies**, proving aggregation runs on `amount_base_usd`. The eleven SENIOR employees sorted by base give a p50 of exactly 106 920 — a nonsensical number if the query touched `amount_original`.
- **N1 has no band**, so `unbandedCount` is a real figure and the outlier list is provably not silently dropping anyone.

Derived totals: headcount **12**, total CTC **1 405 077.50** USD, mean **117 089.79**, unbanded **1**, outliers **3** (U1, U4, I3).

**Files:**
- Create: `src/test/java/com/payscope/support/DatabaseCleaner.java`
- Create: `src/test/java/com/payscope/support/Fixtures.java`
- Create: `src/main/java/com/payscope/analytics/AnalyticsFilter.java`
- Create: `src/main/java/com/payscope/analytics/dto/CompaRatioBucket.java`, `SummaryResponse.java`
- Create: `src/main/java/com/payscope/analytics/AnalyticsRepository.java`, `AnalyticsService.java`, `AnalyticsController.java`
- Modify: `src/test/java/com/payscope/employee/EmployeeListApiTest.java`, `EmployeeListQueryCountTest.java` (adopt `DatabaseCleaner`)
- Test: `src/test/java/com/payscope/analytics/SummaryApiTest.java`

**Interfaces:**
- Produces:
  - `DatabaseCleaner.clean()` → truncates `salary_history`, `salary`, `employee` and restarts identities.
  - `Fixtures.twelveEmployees(EmployeeService)` → `void`.
  - `AnalyticsFilter(String country, Department department, Role role, Level level, EmployeeStatus status)`.
  - `CompaRatioBucket(String bucket, long headcount)` where `bucket` ∈ `LT_80`, `B80_90`, `B90_110`, `B110_120`, `GT_120`.
  - `SummaryResponse(long headcount, MoneyDto totalCostToCompanyUsd, MoneyDto meanBaseUsd, long unbandedCount, List<CompaRatioBucket> compaRatioBuckets)`.
  - `AnalyticsRepository.summary(AnalyticsFilter)` → `SummaryResponse`.
  - `GET /api/analytics/summary` → `200`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/support/DatabaseCleaner.java`
```java
package com.payscope.support;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Analytics assertions are totals over the whole table, so rows committed by
 * other test classes would corrupt them. Called from @BeforeEach in every
 * count-sensitive test. Reference data seeded by Flyway is left untouched.
 */
@Component
public class DatabaseCleaner {

    private final JdbcTemplate jdbc;

    public DatabaseCleaner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void clean() {
        jdbc.execute("truncate table salary_history, salary, employee restart identity cascade");
    }
}
```

`src/test/java/com/payscope/support/Fixtures.java`
```java
package com.payscope.support;

import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeService;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import com.payscope.employee.dto.CreateEmployeeRequest;

import java.time.LocalDate;

/**
 * The fixed analytics dataset. Every expected value in the analytics tests is
 * computed by hand from this table - see the plan's Task 14 for the derivation.
 * Do not change an amount without recomputing every assertion that depends on it.
 */
public final class Fixtures {

    private static final LocalDate HIRED = LocalDate.of(2024, 3, 1);

    private Fixtures() {
    }

    public static void twelveEmployees(EmployeeService service) {
        // Germany: an even-sized group, so percentile_cont's interpolation is pinned.
        engineer(service, "F-G1", "g1@acme.test", "DE", "88000.00",  "EUR");
        engineer(service, "F-G2", "g2@acme.test", "DE", "99000.00",  "EUR");
        engineer(service, "F-G3", "g3@acme.test", "DE", "121000.00", "EUR");
        engineer(service, "F-G4", "g4@acme.test", "DE", "132000.00", "EUR");

        // United States: contains both outlier directions.
        engineer(service, "F-U1", "u1@acme.test", "US", "103950.00", "USD");
        engineer(service, "F-U2", "u2@acme.test", "US", "148500.00", "USD");
        engineer(service, "F-U3", "u3@acme.test", "US", "148500.00", "USD");
        engineer(service, "F-U4", "u4@acme.test", "US", "193050.00", "USD");

        // India: an odd-sized group, so its p50 is an actual observed value.
        engineer(service, "F-I1", "i1@acme.test", "IN", "2970000.00",  "INR");
        engineer(service, "F-I2", "i2@acme.test", "IN", "3712500.00",  "INR");
        engineer(service, "F-I3", "i3@acme.test", "IN", "4640625.00",  "INR");

        // No band exists for a principal recruiter. Counted in headcount and
        // payroll, excluded from compa-ratio, reported via unbandedCount.
        service.create(new CreateEmployeeRequest("F-N1", "Unbanded Person", "n1@acme.test",
                Department.PEOPLE, "US", Role.RECRUITER, Level.PRINCIPAL, EmploymentType.FULL_TIME,
                HIRED, new MoneyDto("200000.00", "USD"), HIRED));
    }

    private static void engineer(EmployeeService service, String number, String email,
                                 String country, String amount, String currency) {
        service.create(new CreateEmployeeRequest(number, "Engineer " + number, email,
                Department.ENGINEERING, country, Role.SOFTWARE_ENGINEER, Level.SENIOR,
                EmploymentType.FULL_TIME, HIRED, new MoneyDto(amount, currency), HIRED));
    }
}
```

`src/test/java/com/payscope/analytics/SummaryApiTest.java`
```java
package com.payscope.analytics;

import com.payscope.employee.EmployeeService;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.Fixtures;
import com.payscope.support.IntegrationTest;
import com.payscope.support.QueryCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class SummaryApiTest {

    @Autowired MockMvc mvc;
    @Autowired EmployeeService employees;
    @Autowired DatabaseCleaner cleaner;
    @Autowired AnalyticsService analytics;
    @Autowired QueryCounter queries;

    @BeforeEach
    void seedTheFixedDataset() {
        cleaner.clean();
        Fixtures.twelveEmployees(employees);
    }

    @Test
    void reports_headcount_total_payroll_and_mean_in_one_currency() throws Exception {
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headcount").value(12))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("1405077.50"))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.currency").value("USD"))
                .andExpect(jsonPath("$.meanBaseUsd.amount").value("117089.79"));
    }

    @Test
    void counts_employees_whose_role_level_and_country_has_no_band() throws Exception {
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.unbandedCount").value(1));
    }

    @Test
    void buckets_every_banded_employee_by_compa_ratio() throws Exception {
        // 11 banded employees: 0.70 | 0.80 0.80 | 0.90 1.00 1.00 1.00 | 1.10 1.20 | 1.25 1.30
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'LT_80')].headcount").value(1))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B80_90')].headcount").value(2))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B90_110')].headcount").value(5))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B110_120')].headcount").value(2))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'GT_120')].headcount").value(2));
    }

    @Test
    void narrows_every_figure_when_a_country_filter_is_applied() throws Exception {
        // Germany only: 95040 + 106920 + 130680 + 142560 = 475200, mean 118800
        mvc.perform(get("/api/analytics/summary").param("country", "DE"))
                .andExpect(jsonPath("$.headcount").value(4))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("475200.00"))
                .andExpect(jsonPath("$.meanBaseUsd.amount").value("118800.00"))
                .andExpect(jsonPath("$.unbandedCount").value(0));
    }

    @Test
    void excludes_soft_deleted_employees_from_every_figure() throws Exception {
        // Deleting U4 (193050 USD) must move both headcount and the payroll total.
        String body = mvc.perform(get("/api/employees").param("q", "u4@acme.test"))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        long id = Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
        mvc.perform(delete("/api/employees/{id}", id)).andExpect(status().isNoContent());

        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.headcount").value(11))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("1212027.50"));
    }

    @Test
    void keeps_inactive_employees_in_the_payroll_total_because_leavers_are_a_real_fact() throws Exception {
        String body = mvc.perform(get("/api/employees").param("q", "u4@acme.test"))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        long id = Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
        mvc.perform(post("/api/employees/{id}/deactivate", id)).andExpect(status().isOk());

        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.headcount").value(12));
        mvc.perform(get("/api/analytics/summary").param("status", "ACTIVE"))
                .andExpect(jsonPath("$.headcount").value(11));
    }

    @Test
    void computes_the_whole_summary_in_a_single_statement() throws Exception {
        long statements = queries.countStatements(
                () -> analytics.summary(new AnalyticsFilter(null, null, null, null, null)));

        assertThat(statements).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=SummaryApiTest`
Expected: FAIL — `AnalyticsService` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/analytics/AnalyticsFilter.java`
```java
package com.payscope.analytics;

import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

/** The four filter dimensions, shared by all three analytics endpoints. */
public record AnalyticsFilter(String country, Department department, Role role, Level level,
                              EmployeeStatus status) {
}
```

`src/main/java/com/payscope/analytics/dto/CompaRatioBucket.java`
```java
package com.payscope.analytics.dto;

public record CompaRatioBucket(String bucket, long headcount) {
}
```

`src/main/java/com/payscope/analytics/dto/SummaryResponse.java`
```java
package com.payscope.analytics.dto;

import com.payscope.common.MoneyDto;

import java.util.List;

public record SummaryResponse(long headcount, MoneyDto totalCostToCompanyUsd, MoneyDto meanBaseUsd,
                              long unbandedCount, List<CompaRatioBucket> compaRatioBuckets) {
}
```

`src/main/java/com/payscope/analytics/AnalyticsRepository.java`
```java
package com.payscope.analytics;

import com.payscope.analytics.dto.CompaRatioBucket;
import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.common.MoneyDto;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * All aggregation is SQL. Nothing here loads rows into memory to compute a
 * total, a mean or a percentile.
 *
 * Every query joins employee and filters deleted_at is null. deleted_at lives
 * only on employee, so a salary-only aggregate would silently include deleted
 * people in total payroll - ADR-0005.
 */
@Repository
public class AnalyticsRepository {

    /** Shared by summary, distribution and outliers so the filters cannot drift apart. */
    static final String FROM_AND_WHERE = """
            from employee e
            join salary s on s.employee_id = e.id
            left join pay_band b on b.job_role = e.job_role
                                and b.job_level = e.job_level
                                and b.country_code = e.country_code
            where e.deleted_at is null
              and (:country    is null or e.country_code = :country)
              and (:department is null or e.department   = :department)
              and (:role       is null or e.job_role     = :role)
              and (:level      is null or e.job_level    = :level)
              and (:status     is null or e.status       = :status)
            """;

    private final EntityManager em;

    public AnalyticsRepository(EntityManager em) {
        this.em = em;
    }

    public SummaryResponse summary(AnalyticsFilter filter) {
        String sql = """
                select count(*)                                         as headcount,
                       coalesce(sum(s.amount_base_usd), 0)              as total_ctc,
                       coalesce(round(avg(s.amount_base_usd), 2), 0)    as mean_base,
                       count(*) filter (where b.band_mid is null)       as unbanded,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid <  0.80) as lt80,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 0.80
                                          and s.amount_original / b.band_mid <  0.90) as b80_90,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 0.90
                                          and s.amount_original / b.band_mid <  1.10) as b90_110,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 1.10
                                          and s.amount_original / b.band_mid <= 1.20) as b110_120,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >  1.20) as gt120
                """ + FROM_AND_WHERE;

        Tuple t = (Tuple) bind(em.createNativeQuery(sql, Tuple.class), filter).getSingleResult();

        return new SummaryResponse(
                ((Number) t.get("headcount")).longValue(),
                new MoneyDto(t.get("total_ctc", BigDecimal.class).setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD"),
                new MoneyDto(t.get("mean_base", BigDecimal.class).setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD"),
                ((Number) t.get("unbanded")).longValue(),
                List.of(
                        new CompaRatioBucket("LT_80", ((Number) t.get("lt80")).longValue()),
                        new CompaRatioBucket("B80_90", ((Number) t.get("b80_90")).longValue()),
                        new CompaRatioBucket("B90_110", ((Number) t.get("b90_110")).longValue()),
                        new CompaRatioBucket("B110_120", ((Number) t.get("b110_120")).longValue()),
                        new CompaRatioBucket("GT_120", ((Number) t.get("gt120")).longValue())));
    }

    static Query bind(Query query, AnalyticsFilter f) {
        return query
                .setParameter("country", f.country())
                .setParameter("department", f.department() == null ? null : f.department().name())
                .setParameter("role", f.role() == null ? null : f.role().name())
                .setParameter("level", f.level() == null ? null : f.level().name())
                .setParameter("status", f.status() == null ? null : f.status().name());
    }
}
```

`src/main/java/com/payscope/analytics/AnalyticsService.java`
```java
package com.payscope.analytics;

import com.payscope.analytics.dto.SummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnalyticsService {

    private final AnalyticsRepository repository;

    public AnalyticsService(AnalyticsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public SummaryResponse summary(AnalyticsFilter filter) {
        return repository.summary(filter);
    }
}
```

`src/main/java/com/payscope/analytics/AnalyticsController.java`
```java
package com.payscope.analytics;

import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    SummaryResponse summary(@RequestParam(required = false) String country,
                            @RequestParam(required = false) Department department,
                            @RequestParam(required = false) Role role,
                            @RequestParam(required = false) Level level,
                            @RequestParam(required = false) EmployeeStatus status) {
        return service.summary(new AnalyticsFilter(country, department, role, level, status));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=SummaryApiTest`
Expected: PASS — 7 tests.

- [ ] **Step 5: Retrofit `DatabaseCleaner` into Task 12's count-sensitive tests**

Both list tests assert global counts and will now fail intermittently depending on execution order. In `EmployeeListApiTest` and `EmployeeListQueryCountTest`, autowire `DatabaseCleaner` and call `cleaner.clean()` as the first line of the existing `@BeforeEach`:
```java
    @Autowired
    DatabaseCleaner cleaner;

    @BeforeEach
    void seed() throws Exception {
        cleaner.clean();
        // ... existing body unchanged
    }
```

Run: `./mvnw test`
Expected: PASS — the whole suite, in any order.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/payscope/analytics src/test/java/com/payscope
git commit -m "feat: add analytics summary over a fixed dataset

Headcount, total cost to company, mean and compa-ratio buckets in one SQL
statement. Every expected value in the tests is computed by hand from a
twelve-employee fixture rather than asserted to be non-null.

Adds DatabaseCleaner: analytics assertions are totals over the whole
table, so rows committed by other test classes would corrupt them. The
list tests share that exposure and now use it too."
```

---

### Task 15: Pay distribution by dimension

Implements spec §8 `/analytics/distribution` and ADR-0003. One parameterized query serves all four dimensions because the maths is identical — the spec names all four, so this is not speculative generality.

**Expected values, derived from the Task 14 fixture.** Recompute these if the fixture changes.

`groupBy=COUNTRY`:

| Group | n | p25 | p50 | p75 | p90 | mean | medianCompaRatio |
|---|---|---|---|---|---|---|---|
| DE | 4 | 103 950.00 | **118 800.00** | 133 650.00 | 138 996.00 | 118 800.00 | 1.0000 |
| IN | 3 | 40 095.00 | 44 550.00 | 50 118.75 | 53 460.00 | 45 292.50 | 1.0000 |
| US | 5 | 148 500.00 | 148 500.00 | 193 050.00 | 197 220.00 | 158 800.00 | 1.0000 |

Germany's p50 of 118 800 is the mean of 106 920 and 130 680 — a figure no employee earns. That is `percentile_cont` interpolating, and it is asserted deliberately.

`groupBy=LEVEL`: the SENIOR group holds eleven employees across three currencies; its p50 is **106 920.00**. That number is only reachable by aggregating `amount_base_usd`.

**Files:**
- Create: `src/main/java/com/payscope/analytics/GroupByDimension.java`
- Create: `src/main/java/com/payscope/analytics/dto/DistributionGroup.java`
- Modify: `src/main/java/com/payscope/analytics/AnalyticsRepository.java`, `AnalyticsService.java`, `AnalyticsController.java`
- Test: `src/test/java/com/payscope/analytics/DistributionApiTest.java`

**Interfaces:**
- Produces:
  - `GroupByDimension` enum: `DEPARTMENT`, `COUNTRY`, `ROLE`, `LEVEL`, each with `column()` and `key()`.
  - `GroupByDimension.parse(List<String>)` → `List<GroupByDimension>`; throws `DomainException` on an unknown name or more than two dimensions.
  - `DistributionGroup(Map<String,String> key, long headcount, MoneyDto p25, MoneyDto p50, MoneyDto p75, MoneyDto p90, MoneyDto mean, BigDecimal medianCompaRatio)`.
  - `AnalyticsRepository.distribution(AnalyticsFilter, List<GroupByDimension>)` → `List<DistributionGroup>`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/analytics/DistributionApiTest.java`
```java
package com.payscope.analytics;

import com.payscope.employee.EmployeeService;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.Fixtures;
import com.payscope.support.IntegrationTest;
import com.payscope.support.QueryCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class DistributionApiTest {

    @Autowired MockMvc mvc;
    @Autowired EmployeeService employees;
    @Autowired DatabaseCleaner cleaner;
    @Autowired AnalyticsService analytics;
    @Autowired QueryCounter queries;

    @BeforeEach
    void seedTheFixedDataset() {
        cleaner.clean();
        Fixtures.twelveEmployees(employees);
    }

    private static final String DE = "$[?(@.key.country == 'DE')]";
    private static final String IN = "$[?(@.key.country == 'IN')]";
    private static final String US = "$[?(@.key.country == 'US')]";

    @Test
    void reports_exact_percentiles_for_each_country() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath(DE + ".headcount").value(4))
                .andExpect(jsonPath(DE + ".p25.amount").value("103950.00"))
                .andExpect(jsonPath(DE + ".p50.amount").value("118800.00"))
                .andExpect(jsonPath(DE + ".p75.amount").value("133650.00"))
                .andExpect(jsonPath(DE + ".p90.amount").value("138996.00"))
                .andExpect(jsonPath(DE + ".mean.amount").value("118800.00"));
    }

    @Test
    void interpolates_the_median_of_an_even_sized_group_rather_than_picking_a_row() throws Exception {
        // Germany's two middle salaries are 106920 and 130680. percentile_cont
        // returns their mean, 118800, which no employee actually earns. This is
        // what "median" means to the persona and what other comp tools report.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(DE + ".p50.amount").value("118800.00"));
    }

    @Test
    void reports_exact_percentiles_for_an_odd_sized_group() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(IN + ".headcount").value(3))
                .andExpect(jsonPath(IN + ".p25.amount").value("40095.00"))
                .andExpect(jsonPath(IN + ".p50.amount").value("44550.00"))
                .andExpect(jsonPath(IN + ".p75.amount").value("50118.75"))
                .andExpect(jsonPath(IN + ".p90.amount").value("53460.00"))
                .andExpect(jsonPath(IN + ".mean.amount").value("45292.50"));
    }

    @Test
    void includes_unbanded_employees_in_the_pay_distribution() throws Exception {
        // The United States group is five, not four: the principal recruiter has
        // no band but is still paid and still counts towards cost.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(US + ".headcount").value(5))
                .andExpect(jsonPath(US + ".mean.amount").value("158800.00"))
                .andExpect(jsonPath(US + ".p90.amount").value("197220.00"));
    }

    @Test
    void excludes_unbanded_employees_from_the_median_compa_ratio() throws Exception {
        // US compa-ratios are 0.70, 1.00, 1.00, 1.30 - the unbanded employee
        // contributes nothing. The median of those four is 1.0000.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(US + ".medianCompaRatio").value(1.0000));
    }

    @Test
    void aggregates_a_mixed_currency_group_on_the_base_amount() throws Exception {
        // Eleven SENIOR employees across EUR, USD and INR. 106920.00 is only
        // reachable by aggregating amount_base_usd; touching amount_original
        // would produce a meaningless mixture.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "LEVEL"))
                .andExpect(jsonPath("$[?(@.key.level == 'SENIOR')].headcount").value(11))
                .andExpect(jsonPath("$[?(@.key.level == 'SENIOR')].p50.amount").value("106920.00"));
    }

    @Test
    void groups_by_two_dimensions_at_once() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY", "LEVEL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key.country == 'IN' && @.key.level == 'SENIOR')].headcount")
                        .value(3));
    }

    @Test
    void narrows_the_groups_when_a_filter_is_applied() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY").param("level", "SENIOR"))
                .andExpect(jsonPath(US + ".headcount").value(4));
    }

    @Test
    void rejects_more_than_two_grouping_dimensions() throws Exception {
        mvc.perform(get("/api/analytics/distribution")
                        .param("groupBy", "COUNTRY", "LEVEL", "DEPARTMENT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("two")));
    }

    @Test
    void rejects_a_grouping_dimension_that_is_not_on_the_whitelist() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "SALARY"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("COUNTRY")));
    }

    @Test
    void defaults_to_a_single_group_covering_the_whole_organization() throws Exception {
        mvc.perform(get("/api/analytics/distribution"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].headcount").value(12));
    }

    @Test
    void computes_every_group_in_a_single_statement() throws Exception {
        long statements = queries.countStatements(() -> analytics.distribution(
                new AnalyticsFilter(null, null, null, null, null), List.of(GroupByDimension.COUNTRY)));

        assertThat(statements).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=DistributionApiTest`
Expected: FAIL — `GroupByDimension` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/analytics/GroupByDimension.java`
```java
package com.payscope.analytics;

import com.payscope.common.DomainException;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The closed set of grouping dimensions. Capped at two: four would produce a
 * cartesian product no reader can use, and the cap is a 400 rather than a
 * surprise - spec section 8.
 */
public enum GroupByDimension {

    DEPARTMENT("e.department", "department"),
    COUNTRY("e.country_code", "country"),
    ROLE("e.job_role", "role"),
    LEVEL("e.job_level", "level");

    public static final int MAX_DIMENSIONS = 2;

    private final String column;
    private final String key;

    GroupByDimension(String column, String key) {
        this.column = column;
        this.key = key;
    }

    public String column() {
        return column;
    }

    public String key() {
        return key;
    }

    public static List<GroupByDimension> parse(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        if (values.size() > MAX_DIMENSIONS) {
            throw new DomainException("Group by at most two dimensions, was given " + values.size());
        }
        return values.stream().map(GroupByDimension::parseOne).toList();
    }

    private static GroupByDimension parseOne(String value) {
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("Cannot group by '" + value + "'. Permitted values: "
                    + Arrays.stream(values()).map(Enum::name).collect(Collectors.joining(", ")));
        }
    }
}
```

`src/main/java/com/payscope/analytics/dto/DistributionGroup.java`
```java
package com.payscope.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Percentiles are in USD and answer "what does this cost". medianCompaRatio is
 * dimensionless and answers "is this fair". Neither is authoritative for the
 * other's question - ADR-0002.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DistributionGroup(Map<String, String> key, long headcount, MoneyDto p25, MoneyDto p50,
                                MoneyDto p75, MoneyDto p90, MoneyDto mean, BigDecimal medianCompaRatio) {
}
```

`src/main/java/com/payscope/analytics/AnalyticsRepository.java` — add:
```java
// add to imports
import com.payscope.analytics.dto.DistributionGroup;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

    public List<DistributionGroup> distribution(AnalyticsFilter filter, List<GroupByDimension> groupBy) {
        String selectedColumns = groupBy.stream()
                .map(d -> d.column() + " as " + d.key())
                .collect(Collectors.joining(",\n       "));
        String groupClause = groupBy.isEmpty() ? ""
                : "group by " + groupBy.stream().map(GroupByDimension::column).collect(Collectors.joining(", "))
                  + "\norder by " + groupBy.stream().map(GroupByDimension::column).collect(Collectors.joining(", "));

        // percentile_cont for every percentile, including the compa-ratio one, so
        // a single payload never carries two percentile methods - ADR-0003.
        String sql = "select " + (selectedColumns.isEmpty() ? "" : selectedColumns + ",\n       ") + """
                count(*) as headcount,
                       round(percentile_cont(0.25) within group (order by s.amount_base_usd), 2) as p25,
                       round(percentile_cont(0.50) within group (order by s.amount_base_usd), 2) as p50,
                       round(percentile_cont(0.75) within group (order by s.amount_base_usd), 2) as p75,
                       round(percentile_cont(0.90) within group (order by s.amount_base_usd), 2) as p90,
                       round(avg(s.amount_base_usd), 2) as mean,
                       round(percentile_cont(0.50) within group (
                               order by s.amount_original / b.band_mid), 4) as median_compa_ratio
                """ + FROM_AND_WHERE + groupClause;

        @SuppressWarnings("unchecked")
        List<Tuple> rows = bind(em.createNativeQuery(sql, Tuple.class), filter).getResultList();

        List<DistributionGroup> groups = new ArrayList<>();
        for (Tuple row : rows) {
            Map<String, String> key = new LinkedHashMap<>();
            for (GroupByDimension dimension : groupBy) {
                Object value = row.get(dimension.key());
                key.put(dimension.key(), value == null ? null : value.toString());
            }
            groups.add(new DistributionGroup(key,
                    ((Number) row.get("headcount")).longValue(),
                    usd(row.get("p25", BigDecimal.class)),
                    usd(row.get("p50", BigDecimal.class)),
                    usd(row.get("p75", BigDecimal.class)),
                    usd(row.get("p90", BigDecimal.class)),
                    usd(row.get("mean", BigDecimal.class)),
                    row.get("median_compa_ratio", BigDecimal.class)));
        }
        return groups;
    }

    private static MoneyDto usd(BigDecimal amount) {
        return amount == null ? null : new MoneyDto(
                amount.setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD");
    }
```

`src/main/java/com/payscope/analytics/AnalyticsService.java` — add:
```java
// add to imports
import com.payscope.analytics.dto.DistributionGroup;
import java.util.List;

    @Transactional(readOnly = true)
    public List<DistributionGroup> distribution(AnalyticsFilter filter, List<GroupByDimension> groupBy) {
        return repository.distribution(filter, groupBy);
    }
```

`src/main/java/com/payscope/analytics/AnalyticsController.java` — add:
```java
// add to imports
import com.payscope.analytics.dto.DistributionGroup;
import java.util.List;

    @GetMapping("/distribution")
    List<DistributionGroup> distribution(@RequestParam(required = false) List<String> groupBy,
                                         @RequestParam(required = false) String country,
                                         @RequestParam(required = false) Department department,
                                         @RequestParam(required = false) Role role,
                                         @RequestParam(required = false) Level level,
                                         @RequestParam(required = false) EmployeeStatus status) {
        return service.distribution(new AnalyticsFilter(country, department, role, level, status),
                GroupByDimension.parse(groupBy));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=DistributionApiTest`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/analytics src/test/java/com/payscope/analytics/DistributionApiTest.java
git commit -m "feat: add pay distribution grouped by up to two dimensions

One parameterized query serves all four dimensions because the maths is
identical across them. Percentiles use percentile_cont over the base USD
amount, so a group spanning three currencies still produces a meaningful
median; median compa-ratio is carried alongside as the currency-neutral
fairness figure."
```

---

### Task 16: Outlier detection

Implements spec §8 `/analytics/outliers` and ADR-0002's thresholds. Paginated, because this can return hundreds of people in a real organization.

From the Task 14 fixture, exactly three employees fall outside the window: U1 at 0.7000, I3 at 1.2500, U4 at 1.3000. The unbanded employee is not among them — a null compa-ratio is never an outlier.

**Files:**
- Create: `src/main/java/com/payscope/analytics/dto/OutlierItem.java`
- Modify: `src/main/java/com/payscope/analytics/AnalyticsRepository.java`, `AnalyticsService.java`, `AnalyticsController.java`
- Test: `src/test/java/com/payscope/analytics/OutliersApiTest.java`

**Interfaces:**
- Produces:
  - `OutlierItem(Long employeeId, String employeeNumber, String fullName, String countryCode, String role, String level, MoneyDto salary, MoneyDto bandMid, BigDecimal compaRatio)`.
  - `AnalyticsRepository.outliers(AnalyticsFilter, int page, int size)` → `PagedResponse<OutlierItem>`.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/analytics/OutliersApiTest.java`
```java
package com.payscope.analytics;

import com.payscope.employee.EmployeeService;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.Fixtures;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class OutliersApiTest {

    @Autowired MockMvc mvc;
    @Autowired EmployeeService employees;
    @Autowired DatabaseCleaner cleaner;

    @BeforeEach
    void seedTheFixedDataset() {
        cleaner.clean();
        Fixtures.twelveEmployees(employees);
    }

    @Test
    void lists_exactly_the_employees_outside_the_eighty_to_one_hundred_and_twenty_window() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void orders_the_most_underpaid_first_so_the_worst_case_is_at_the_top() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-U1"))
                .andExpect(jsonPath("$.content[0].compaRatio").value(0.7000))
                .andExpect(jsonPath("$.content[1].employeeNumber").value("F-I3"))
                .andExpect(jsonPath("$.content[1].compaRatio").value(1.2500))
                .andExpect(jsonPath("$.content[2].employeeNumber").value("F-U4"))
                .andExpect(jsonPath("$.content[2].compaRatio").value(1.3000));
    }

    @Test
    void shows_the_salary_and_the_band_midpoint_it_was_measured_against() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[0].salary.amount").value("103950.00"))
                .andExpect(jsonPath("$.content[0].salary.currency").value("USD"))
                .andExpect(jsonPath("$.content[0].bandMid.amount").value("148500.00"));
    }

    @Test
    void expresses_an_indian_outlier_in_rupees_against_its_rupee_band() throws Exception {
        // Compa-ratio never crosses a currency: both sides are local - ADR-0002.
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[1].salary.currency").value("INR"))
                .andExpect(jsonPath("$.content[1].salary.amount").value("4640625.00"))
                .andExpect(jsonPath("$.content[1].bandMid.amount").value("3712500.00"));
    }

    @Test
    void never_reports_an_unbanded_employee_as_an_outlier() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-N1')]").isEmpty());
    }

    @Test
    void treats_exactly_eighty_and_exactly_one_hundred_and_twenty_percent_as_within_band() throws Exception {
        // G1 sits at 0.8000 and G4 at 1.2000. Both are inside the window.
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-G1')]").isEmpty())
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-G4')]").isEmpty());
    }

    @Test
    void narrows_the_list_when_a_country_filter_is_applied() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("country", "IN"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-I3"));
    }

    @Test
    void paginates_the_results() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("size", "2"))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));

        mvc.perform(get("/api/analytics/outliers").param("size", "2").param("page", "1"))
                .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    void rejects_a_page_size_above_one_hundred() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("size", "500"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("100")));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=OutliersApiTest`
Expected: FAIL — `/api/analytics/outliers` is unmapped.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/analytics/dto/OutlierItem.java`
```java
package com.payscope.analytics.dto;

import com.payscope.common.MoneyDto;

import java.math.BigDecimal;

public record OutlierItem(Long employeeId, String employeeNumber, String fullName, String countryCode,
                          String role, String level, MoneyDto salary, MoneyDto bandMid,
                          BigDecimal compaRatio) {
}
```

`src/main/java/com/payscope/analytics/AnalyticsRepository.java` — add:
```java
// add to imports
import com.payscope.common.PagedResponse;
import com.payscope.salary.CompaRatio;

    /**
     * An inner join to pay_band, not a left join: an employee with no band has a
     * null compa-ratio and is never an outlier. The boundaries are inclusive, so
     * exactly 0.80 and exactly 1.20 are inside the window.
     */
    private static final String OUTLIER_PREDICATE = """
              and b.band_mid is not null
              and (s.amount_original / b.band_mid < :low or s.amount_original / b.band_mid > :high)
            """;

    public PagedResponse<OutlierItem> outliers(AnalyticsFilter filter, int page, int size) {
        String sql = """
                select e.id, e.employee_number, e.full_name, e.country_code, e.job_role, e.job_level,
                       s.amount_original, s.currency_code, b.band_mid,
                       round(s.amount_original / b.band_mid, 4) as compa_ratio
                """ + FROM_AND_WHERE + OUTLIER_PREDICATE + """
                order by compa_ratio asc, e.id asc
                limit :size offset :offset
                """;

        @SuppressWarnings("unchecked")
        List<Tuple> rows = bindOutlier(em.createNativeQuery(sql, Tuple.class), filter)
                .setParameter("size", size)
                .setParameter("offset", page * size)
                .getResultList();

        Number total = (Number) bindOutlier(
                em.createNativeQuery("select count(*) " + FROM_AND_WHERE + OUTLIER_PREDICATE), filter)
                .getSingleResult();

        List<OutlierItem> content = rows.stream().map(row -> new OutlierItem(
                ((Number) row.get("id")).longValue(),
                row.get("employee_number", String.class),
                row.get("full_name", String.class),
                row.get("country_code", String.class),
                row.get("job_role", String.class),
                row.get("job_level", String.class),
                new MoneyDto(row.get("amount_original", BigDecimal.class).toPlainString(),
                        row.get("currency_code", String.class)),
                new MoneyDto(row.get("band_mid", BigDecimal.class).toPlainString(),
                        row.get("currency_code", String.class)),
                row.get("compa_ratio", BigDecimal.class))).toList();

        return PagedResponse.of(content, page, size, total.longValue());
    }

    private Query bindOutlier(Query query, AnalyticsFilter filter) {
        return bind(query, filter)
                .setParameter("low", CompaRatio.LOW)
                .setParameter("high", CompaRatio.HIGH);
    }
```

`src/main/java/com/payscope/analytics/AnalyticsService.java` — add:
```java
// add to imports
import com.payscope.analytics.dto.OutlierItem;
import com.payscope.common.DomainException;
import com.payscope.common.PagedResponse;

    public static final int MAX_PAGE_SIZE = 100;

    @Transactional(readOnly = true)
    public PagedResponse<OutlierItem> outliers(AnalyticsFilter filter, int page, int size) {
        if (page < 0) {
            throw new DomainException("Page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new DomainException("Page size must be between 1 and " + MAX_PAGE_SIZE + ", was " + size);
        }
        return repository.outliers(filter, page, size);
    }
```

`src/main/java/com/payscope/analytics/AnalyticsController.java` — add:
```java
// add to imports
import com.payscope.analytics.dto.OutlierItem;
import com.payscope.common.PagedResponse;

    @GetMapping("/outliers")
    PagedResponse<OutlierItem> outliers(@RequestParam(required = false) String country,
                                        @RequestParam(required = false) Department department,
                                        @RequestParam(required = false) Role role,
                                        @RequestParam(required = false) Level level,
                                        @RequestParam(required = false) EmployeeStatus status,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "25") int size) {
        return service.outliers(new AnalyticsFilter(country, department, role, level, status), page, size);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=OutliersApiTest`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/payscope/analytics src/test/java/com/payscope/analytics/OutliersApiTest.java
git commit -m "feat: add compa-ratio outlier detection

Each outlier is shown in its own currency against its own local band, so
the figure can be explained to the person reading it. Employees with no
band are excluded rather than treated as underpaid, and the 80 and 120
percent boundaries are inclusive."
```

---

### Task 17: Seeding 10,000 employees

Implements spec §11. Three properties matter equally: fast, reproducible, and shaped like a real organization.

**Files:**
- Create: `src/main/java/com/payscope/seed/SeedProperties.java`, `EmployeeGenerator.java`, `SeedRunner.java`
- Modify: `src/main/java/com/payscope/PayscopeApplication.java` (enable configuration properties)
- Test: `src/test/java/com/payscope/seed/SeedRunnerTest.java`

**Interfaces:**
- Produces:
  - `SeedProperties` bound to `payscope.seed`: `enabled` (default `false`), `employeeCount` (default `10000`), `randomSeed` (default `20260912`).
  - `EmployeeGenerator.generate(int count)` → `List<GeneratedEmployee>`, deterministic for a given seed.
  - `SeedRunner.seed()` → `int` (rows written; `0` when already seeded).

- [ ] **Step 1: Write the failing test**

`src/test/java/com/payscope/seed/SeedRunnerTest.java`
```java
package com.payscope.seed;

import com.payscope.support.DatabaseCleaner;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@TestPropertySource(properties = {
        "payscope.seed.enabled=false",   // the runner is invoked explicitly, not on startup
        "payscope.seed.employee-count=500",
        "payscope.seed.random-seed=20260912"
})
class SeedRunnerTest {

    @Autowired SeedRunner runner;
    @Autowired JdbcTemplate jdbc;
    @Autowired DatabaseCleaner cleaner;

    @BeforeEach
    void startFromEmpty() {
        cleaner.clean();
    }

    @Test
    void writes_one_employee_and_one_salary_per_requested_row() {
        runner.seed();

        assertThat(jdbc.queryForObject("select count(*) from employee", Integer.class)).isEqualTo(500);
        assertThat(jdbc.queryForObject("select count(*) from salary", Integer.class)).isEqualTo(500);
    }

    @Test
    void produces_the_same_population_on_every_run_for_a_given_seed() {
        runner.seed();
        String firstName = jdbc.queryForObject(
                "select full_name from employee order by id limit 1", String.class);
        BigDecimal firstSalary = jdbc.queryForObject(
                "select s.amount_original from salary s join employee e on e.id = s.employee_id"
                        + " order by e.id limit 1", BigDecimal.class);

        cleaner.clean();
        runner.seed();

        assertThat(jdbc.queryForObject("select full_name from employee order by id limit 1", String.class))
                .isEqualTo(firstName);
        assertThat(jdbc.queryForObject("select s.amount_original from salary s"
                + " join employee e on e.id = s.employee_id order by e.id limit 1", BigDecimal.class))
                .isEqualByComparingTo(firstSalary);
    }

    @Test
    void does_nothing_on_a_second_run_rather_than_doubling_the_population() {
        runner.seed();

        int written = runner.seed();

        assertThat(written).isZero();
        assertThat(jdbc.queryForObject("select count(*) from employee", Integer.class)).isEqualTo(500);
    }

    @Test
    void gives_every_employee_a_salary_in_their_own_countrys_currency() {
        runner.seed();

        Integer mismatched = jdbc.queryForObject("""
                select count(*) from employee e
                join salary s on s.employee_id = e.id
                join country c on c.country_code = e.country_code
                where s.currency_code <> c.currency_code
                """, Integer.class);

        assertThat(mismatched).isZero();
    }

    @Test
    void places_a_small_deliberate_minority_outside_the_band() {
        // An outlier detector with no outliers in it demos as broken.
        runner.seed();

        Integer outliers = jdbc.queryForObject("""
                select count(*) from employee e
                join salary s on s.employee_id = e.id
                join pay_band b on b.job_role = e.job_role and b.job_level = e.job_level
                                and b.country_code = e.country_code
                where s.amount_original / b.band_mid < 0.80
                   or s.amount_original / b.band_mid > 1.20
                """, Integer.class);

        assertThat(outliers).isBetween(10, 45);
    }

    @Test
    void produces_a_level_pyramid_with_more_juniors_than_principals() {
        runner.seed();

        Integer juniors = jdbc.queryForObject(
                "select count(*) from employee where job_level = 'JUNIOR'", Integer.class);
        Integer principals = jdbc.queryForObject(
                "select count(*) from employee where job_level = 'PRINCIPAL'", Integer.class);

        assertThat(juniors).isGreaterThan(principals);
    }

    @Test
    void gives_some_employees_a_salary_history_so_timelines_are_not_empty() {
        runner.seed();

        Integer historyRows = jdbc.queryForObject("select count(*) from salary_history", Integer.class);

        assertThat(historyRows).isGreaterThan(50);
    }

    @Test
    void spreads_employees_across_every_country() {
        runner.seed();

        Integer countries = jdbc.queryForObject(
                "select count(distinct country_code) from employee", Integer.class);

        assertThat(countries).isEqualTo(6);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=SeedRunnerTest`
Expected: FAIL — `SeedRunner` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/main/java/com/payscope/seed/SeedProperties.java`
```java
package com.payscope.seed;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payscope.seed")
public class SeedProperties {

    private boolean enabled = false;
    private int employeeCount = 10_000;
    /** Fixed, so the same population appears on every run - CLAUDE.md bans unseeded randomness. */
    private long randomSeed = 20260912L;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getEmployeeCount() { return employeeCount; }
    public void setEmployeeCount(int employeeCount) { this.employeeCount = employeeCount; }
    public long getRandomSeed() { return randomSeed; }
    public void setRandomSeed(long randomSeed) { this.randomSeed = randomSeed; }
}
```

`src/main/java/com/payscope/PayscopeApplication.java` — add:
```java
// add to imports
import com.payscope.seed.SeedProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@EnableConfigurationProperties(SeedProperties.class)   // add above the class declaration
```

`src/main/java/com/payscope/seed/EmployeeGenerator.java`
```java
package com.payscope.seed;

import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

import java.time.LocalDate;
import java.util.List;
import java.util.Random;

/**
 * Deterministic given a seed. The distribution is shaped rather than uniform: a
 * level pyramid, salaries clustered around each band midpoint, and a small
 * deliberate minority outside the band so the outlier feature has something
 * true to find - spec section 11.
 */
public class EmployeeGenerator {

    public record GeneratedEmployee(String employeeNumber, String fullName, String email,
                                    Department department, String countryCode, Role role, Level level,
                                    EmploymentType employmentType, LocalDate hireDate,
                                    EmployeeStatus status, double bandFactor, int raiseCount) {
    }

    private static final String[] GIVEN_NAMES = {
            "Asha", "Ben", "Chen", "Dana", "Ekaterina", "Farid", "Grace", "Hiro", "Ines", "Jonas",
            "Kavya", "Lucas", "Mei", "Nadia", "Omar", "Priya", "Quentin", "Rosa", "Sven", "Tara"};
    private static final String[] FAMILY_NAMES = {
            "Menon", "Carter", "Wei", "Silva", "Novak", "Haddad", "Okonkwo", "Tanaka", "Duarte", "Berg",
            "Iyer", "Moreau", "Zhang", "Rahman", "Costa", "Nilsson", "Ferrari", "Lopez", "Adebayo", "Kaur"};

    /** country code, weight */
    private static final Object[][] COUNTRIES = {
            {"US", 30}, {"IN", 30}, {"GB", 15}, {"DE", 10}, {"SG", 8}, {"BR", 7}};

    /** level, weight - a pyramid, not a uniform draw */
    private static final Object[][] LEVELS = {
            {Level.JUNIOR, 35}, {Level.MID, 30}, {Level.SENIOR, 20}, {Level.STAFF, 10}, {Level.PRINCIPAL, 5}};

    /** role paired with the department it belongs to */
    private static final Object[][] ROLES = {
            {Role.SOFTWARE_ENGINEER, Department.ENGINEERING, 30},
            {Role.DATA_ENGINEER, Department.ENGINEERING, 10},
            {Role.PRODUCT_MANAGER, Department.PRODUCT, 8},
            {Role.DESIGNER, Department.DESIGN, 7},
            {Role.ACCOUNT_EXECUTIVE, Department.SALES, 15},
            {Role.MARKETING_MANAGER, Department.MARKETING, 8},
            {Role.ACCOUNTANT, Department.FINANCE, 7},
            {Role.RECRUITER, Department.PEOPLE, 5},
            {Role.SUPPORT_SPECIALIST, Department.SUPPORT, 10}};

    private final Random random;

    public EmployeeGenerator(long seed) {
        this.random = new Random(seed);
    }

    public List<GeneratedEmployee> generate(int count) {
        return java.util.stream.IntStream.range(0, count).mapToObj(this::one).toList();
    }

    private GeneratedEmployee one(int index) {
        String given = GIVEN_NAMES[random.nextInt(GIVEN_NAMES.length)];
        String family = FAMILY_NAMES[random.nextInt(FAMILY_NAMES.length)];
        String country = (String) weighted(COUNTRIES, 0, 1);
        Level level = (Level) weighted(LEVELS, 0, 1);

        Object[] roleRow = weightedRow(ROLES, 2);
        Role role = (Role) roleRow[0];
        Department department = (Department) roleRow[1];

        // 2% clearly underpaid, 2% clearly overpaid, the rest clustered around the midpoint.
        double draw = random.nextDouble();
        double bandFactor;
        if (draw < 0.02) {
            bandFactor = 0.60 + random.nextDouble() * 0.19;
        } else if (draw < 0.04) {
            bandFactor = 1.21 + random.nextDouble() * 0.29;
        } else {
            bandFactor = 0.85 + random.nextDouble() * 0.30;
        }

        LocalDate hireDate = LocalDate.of(2015, 1, 1).plusDays(random.nextInt(4000));
        EmployeeStatus status = random.nextDouble() < 0.08 ? EmployeeStatus.INACTIVE : EmployeeStatus.ACTIVE;
        EmploymentType type = random.nextDouble() < 0.90 ? EmploymentType.FULL_TIME
                : (random.nextBoolean() ? EmploymentType.PART_TIME : EmploymentType.CONTRACT);
        int raiseCount = random.nextDouble() < 0.30 ? 1 + random.nextInt(3) : 0;

        return new GeneratedEmployee(
                "PS-%06d".formatted(index + 1),
                given + " " + family,
                "%s.%s.%d@acme.test".formatted(given.toLowerCase(), family.toLowerCase(), index + 1),
                department, country, role, level, type, hireDate, status, bandFactor, raiseCount);
    }

    private Object weighted(Object[][] rows, int valueIndex, int weightIndex) {
        return weightedRow(rows, weightIndex)[valueIndex];
    }

    private Object[] weightedRow(Object[][] rows, int weightIndex) {
        int total = 0;
        for (Object[] row : rows) {
            total += (Integer) row[weightIndex];
        }
        int pick = random.nextInt(total);
        for (Object[] row : rows) {
            pick -= (Integer) row[weightIndex];
            if (pick < 0) {
                return row;
            }
        }
        return rows[rows.length - 1];
    }
}
```

`src/main/java/com/payscope/seed/SeedRunner.java`
```java
package com.payscope.seed;

import com.payscope.seed.EmployeeGenerator.GeneratedEmployee;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class SeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);
    private static final long ADVISORY_LOCK_KEY = 8_675_309L;
    private static final LocalDate RATE_DATE = LocalDate.of(2026, 1, 1);
    private static final int BATCH_SIZE = 1000;

    private final JdbcTemplate jdbc;
    private final SeedProperties properties;

    public SeedRunner(JdbcTemplate jdbc, SeedProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (properties.isEnabled()) {
            seed();
        }
    }

    /**
     * Transaction-scoped advisory lock: two concurrent starts cannot double-seed,
     * and the lock releases itself on commit whichever way this ends.
     */
    @Transactional
    public int seed() {
        // pg_advisory_xact_lock returns void, so this must be a ResultSetExtractor
        // query - queryForObject(..., Void.class) would throw.
        jdbc.query("select pg_advisory_xact_lock(?)", rs -> null, ADVISORY_LOCK_KEY);

        Integer existing = jdbc.queryForObject("select count(*) from employee", Integer.class);
        if (existing != null && existing > 0) {
            log.info("Seed skipped: {} employees already present", existing);
            return 0;
        }

        long started = System.currentTimeMillis();
        int count = properties.getEmployeeCount();
        List<GeneratedEmployee> people = new EmployeeGenerator(properties.getRandomSeed()).generate(count);

        Map<String, String> currencyByCountry = currencyByCountry();
        Map<String, BigDecimal> rateByCurrency = rateByCurrency();
        Map<String, BigDecimal> bandMidByKey = bandMidByKey();

        // Ids are drawn up front, so employee, salary and history rows can all be
        // batched without a round trip per row to discover generated keys.
        List<Long> ids = jdbc.queryForList(
                "select nextval('employee_id_seq') from generate_series(1, ?)", Long.class, count);

        insertEmployees(people, ids);
        insertSalaries(people, ids, currencyByCountry, rateByCurrency, bandMidByKey);

        log.info("Seeded {} employees in {} ms", count, System.currentTimeMillis() - started);
        return count;
    }

    private void insertEmployees(List<GeneratedEmployee> people, List<Long> ids) {
        jdbc.batchUpdate("""
                insert into employee (id, employee_number, full_name, email, department, country_code,
                                      job_role, job_level, employment_type, hire_date, status, version)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, people.stream().map(p -> new Object[]{
                ids.get(people.indexOf(p)), p.employeeNumber(), p.fullName(), p.email(),
                p.department().name(), p.countryCode(), p.role().name(), p.level().name(),
                p.employmentType().name(), Date.valueOf(p.hireDate()), p.status().name()
        }).toList(), BATCH_SIZE, (ps, arg) -> {
            for (int i = 0; i < arg.length; i++) {
                ps.setObject(i + 1, arg[i]);
            }
        });
    }

    private void insertSalaries(List<GeneratedEmployee> people, List<Long> ids,
                                Map<String, String> currencyByCountry, Map<String, BigDecimal> rateByCurrency,
                                Map<String, BigDecimal> bandMidByKey) {
        List<Object[]> salaries = new ArrayList<>();
        List<Object[]> historyRows = new ArrayList<>();

        for (int i = 0; i < people.size(); i++) {
            GeneratedEmployee person = people.get(i);
            long id = ids.get(i);
            String currency = currencyByCountry.get(person.countryCode());
            BigDecimal rate = rateByCurrency.get(currency);

            BigDecimal mid = bandMidByKey.get(
                    person.role().name() + "|" + person.level().name() + "|" + person.countryCode());
            // Unbanded combinations still need a plausible salary. 50000 USD
            // converted into local currency is the fallback.
            BigDecimal reference = mid != null ? mid
                    : new BigDecimal("50000").divide(rate, 2, RoundingMode.HALF_UP);

            BigDecimal current = reference.multiply(BigDecimal.valueOf(person.bandFactor()))
                    .setScale(2, RoundingMode.HALF_UP);
            LocalDate effectiveFrom = person.hireDate();

            // Walk backwards: each earlier salary is 92% of the one after it.
            BigDecimal amount = current;
            LocalDate from = effectiveFrom;
            List<Object[]> priors = new ArrayList<>();
            for (int r = 0; r < person.raiseCount(); r++) {
                BigDecimal earlier = amount.multiply(new BigDecimal("0.92")).setScale(2, RoundingMode.HALF_UP);
                LocalDate earlierFrom = from.minusYears(1);
                priors.add(new Object[]{id, earlier, currency, earlier.multiply(rate).setScale(2, RoundingMode.HALF_UP),
                        rate, Date.valueOf(RATE_DATE), Date.valueOf(earlierFrom), Date.valueOf(from),
                        "Annual review"});
                amount = earlier;
                from = earlierFrom;
            }
            historyRows.addAll(priors);

            salaries.add(new Object[]{id, current, currency,
                    current.multiply(rate).setScale(2, RoundingMode.HALF_UP), rate,
                    Date.valueOf(RATE_DATE), Date.valueOf(effectiveFrom)});
        }

        jdbc.batchUpdate("""
                insert into salary (employee_id, amount_original, currency_code, amount_base_usd,
                                    fx_rate, fx_rate_date, effective_from, version)
                values (?, ?, ?, ?, ?, ?, ?, 0)
                """, salaries, BATCH_SIZE, (ps, arg) -> {
            for (int i = 0; i < arg.length; i++) {
                ps.setObject(i + 1, arg[i]);
            }
        });

        jdbc.batchUpdate("""
                insert into salary_history (employee_id, amount_original, currency_code, amount_base_usd,
                                            fx_rate, fx_rate_date, effective_from, effective_to, change_reason)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, historyRows, BATCH_SIZE, (ps, arg) -> {
            for (int i = 0; i < arg.length; i++) {
                ps.setObject(i + 1, arg[i]);
            }
        });
    }

    // These use RowMapper + toMap rather than a bare jdbc.query lambda: a void
    // lambda is ambiguous between RowCallbackHandler and ResultSetExtractor.
    private Map<String, String> currencyByCountry() {
        Map<String, String> map = new HashMap<>();
        jdbc.query("select country_code, currency_code from country",
                (rs, rowNum) -> map.put(rs.getString(1), rs.getString(2)));
        return map;
    }

    private Map<String, BigDecimal> rateByCurrency() {
        Map<String, BigDecimal> map = new HashMap<>();
        jdbc.query("select currency_code, rate_to_usd from fx_rate where rate_date = ?",
                (rs, rowNum) -> map.put(rs.getString(1), rs.getBigDecimal(2)),
                Date.valueOf(RATE_DATE));
        return map;
    }

    private Map<String, BigDecimal> bandMidByKey() {
        Map<String, BigDecimal> map = new HashMap<>();
        jdbc.query("select job_role, job_level, country_code, band_mid from pay_band",
                (rs, rowNum) -> map.put(
                        rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3),
                        rs.getBigDecimal(4)));
        return map;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=SeedRunnerTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Refactor the O(n²) lookup and re-run**

`insertEmployees` calls `people.indexOf(p)` inside a stream — linear scan per row, so seeding 10,000 employees performs 50 million comparisons. Replace the stream with an indexed loop:
```java
        List<Object[]> rows = new ArrayList<>(people.size());
        for (int i = 0; i < people.size(); i++) {
            GeneratedEmployee p = people.get(i);
            rows.add(new Object[]{ids.get(i), p.employeeNumber(), p.fullName(), p.email(),
                    p.department().name(), p.countryCode(), p.role().name(), p.level().name(),
                    p.employmentType().name(), Date.valueOf(p.hireDate()), p.status().name()});
        }
```
then batch over `rows`.

Run: `./mvnw test -Dtest=SeedRunnerTest`
Expected: PASS.

- [ ] **Step 6: Verify the performance target by hand**

Run: `./mvnw spring-boot:run -Dspring-boot.run.profiles=dev` against a running `docker compose up db`.
Expected: the log line `Seeded 10000 employees in NNN ms` reports well under 10 seconds. This is a manual check, not an assertion — a timing assertion in the suite would be exactly the wall-clock dependence `CLAUDE.md` bans.

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/payscope/seed src/main/java/com/payscope/PayscopeApplication.java \
        src/test/java/com/payscope/seed
git commit -m "feat: seed ten thousand employees deterministically

Ids are drawn up front so employee, salary and history rows all batch
without a round trip per row, and reWriteBatchedInserts lets the driver
collapse each batch into multi-row inserts.

The population is shaped rather than uniform: a level pyramid, salaries
clustered around each band midpoint, and roughly four percent placed
outside the band on purpose, because an outlier detector with no outliers
in it demos as broken."
```

---

### Task 18: Running the whole thing

Implements the last success criterion: a reviewer clones the repository and has it running in under five minutes.

**Files:**
- Modify: `docker-compose.yml` (add the application service)
- Create: `Dockerfile`
- Create: `README.md`

- [ ] **Step 1: Write the failing test**

This task has no unit test — its deliverable is a working `docker compose up`, verified by executing it. The check is scripted instead:

`src/test/java/com/payscope/DocumentedEndpointsTest.java`
```java
package com.payscope;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The README lists the API. This fails if an endpoint exists that the README
 * does not mention, so the documentation cannot silently drift.
 */
@IntegrationTest
class DocumentedEndpointsTest {

    @Autowired
    RequestMappingInfoHandlerMapping handlerMapping;

    @Test
    void every_api_path_appears_in_the_readme() throws Exception {
        String readme = Files.readString(Path.of("README.md"));

        handlerMapping.getHandlerMethods().keySet().stream()
                .flatMap(info -> info.getPathPatternsCondition().getPatterns().stream())
                .map(Object::toString)
                .filter(path -> path.startsWith("/api/"))
                .distinct()
                .forEach(path -> assertThat(readme)
                        .as("README.md must document %s", path)
                        .contains(path));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=DocumentedEndpointsTest`
Expected: FAIL — `README.md` does not exist.

- [ ] **Step 3: Write minimal implementation**

`Dockerfile`
```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/payscope-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

`docker-compose.yml` — add alongside the existing `db` service:
```yaml
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      SPRING_PROFILES_ACTIVE: dev
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/payscope?reWriteBatchedInserts=true
      SPRING_DATASOURCE_USERNAME: payscope
      SPRING_DATASOURCE_PASSWORD: payscope
    ports:
      - "8080:8080"
```

`README.md`
```markdown
# Payscope

Salary management and pay insights for an HR team operating across several
countries. See `requirements.md` for scope and `docs/superpowers/specs/` for the
design.

## Run it

    docker compose up

The API comes up on http://localhost:8080 with 10,000 seeded employees. First
build takes a few minutes; subsequent starts are seconds.

To run against a local database instead:

    docker compose up db
    ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

## Test it

    ./mvnw test

Tests run against a real PostgreSQL via Testcontainers, so Docker must be
running. H2 is deliberately not used: the design depends on `percentile_cont`,
partial unique indexes and `SELECT ... FOR SHARE`, none of which H2 reproduces.

## API

Money is always a string with an explicit currency: `{"amount":"125000.00","currency":"INR"}`.
Errors are RFC 7807 `application/problem+json`.

### Employees

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/employees` | Paginated. `country`, `department`, `level`, `status`, `q`, `page`, `size` (1-100), `sort`, `direction`. |
| `POST` | `/api/employees` | Creates employee and initial salary together. 201. |
| `GET` | `/api/employees/{id}` | Record, salary, compa-ratio, band, both version tokens. |
| `PUT` | `/api/employees/{id}` | Requires `employeeVersion`. 409 if stale. |
| `POST` | `/api/employees/{id}/deactivate` | Idempotent. |
| `DELETE` | `/api/employees/{id}` | Soft delete. Idempotent, 204. |

### Salary

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/employees/{id}/salary` | Records a raise. Requires `salaryVersion`. 200. |
| `GET` | `/api/employees/{id}/salary-history` | Append-only timeline. |

### Analytics

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/analytics/summary` | Headcount, total cost to company, mean, unbanded count, compa-ratio buckets. |
| `GET` | `/api/analytics/distribution` | `groupBy` (up to two of `DEPARTMENT`, `COUNTRY`, `ROLE`, `LEVEL`). p25/p50/p75/p90, mean, median compa-ratio. |
| `GET` | `/api/analytics/outliers` | Paginated. Compa-ratio below 0.80 or above 1.20. |

## Two things worth knowing

**Cost and fairness are different questions.** Percentiles are in USD and answer
what a group costs. Compa-ratio compares each salary against its own country's
band, so it carries no exchange-rate exposure and is the figure to use when
comparing India with the UK.

**Deleting and deactivating are different.** Deactivation records that someone
left; they still count in payroll history. Deletion says the record should not
exist; it disappears from every figure.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=DocumentedEndpointsTest`
Expected: PASS.

- [ ] **Step 5: Verify the five-minute claim by hand**

```bash
docker compose down -v
docker compose up --build
curl -s localhost:8080/api/analytics/summary
```
Expected: a summary with `"headcount": 10000`.

- [ ] **Step 6: Run the entire suite**

Run: `./mvnw test`
Expected: PASS, all classes. Do not proceed to the frontend plan with a red suite.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml README.md src/test/java/com/payscope/DocumentedEndpointsTest.java
git commit -m "docs: add README and compose the full stack

A test asserts every mapped /api path appears in the README, so the
documentation cannot drift away from the endpoints it describes."
```

---

## Spec coverage

Every section of `docs/superpowers/specs/2026-09-12-payscope-design.md` maps to a task.

| Spec section | Tasks |
|---|---|
| §3 Data model — six tables, `Money`, indexes | 2, 3, 4, 5, 6 |
| §4 N+1 prevention — projection reads, no inverse `@OneToOne`, `open-in-view=false`, query-count proof | 1 (config), 6 (no back-reference), 12 (projection + counts) |
| §5 Soft delete — distinct from status, partial indexes, join requirement | 4, 11, 14 |
| §6 Pagination — size cap, sort whitelist, id tiebreaker, own DTO | 12 |
| §7 Concurrency and idempotency — two versions, version-free transitions, `FOR SHARE`, advisory lock | 10, 11, 13, 17 |
| §8 API contract — endpoints, status codes, four validation layers, money as string, unbanded surfaced | 8, 9, 10, 11, 12, 13, 14, 15, 16 |
| §9 Analytics query shape — `percentile_cont`, base-USD aggregation, cost vs fairness | 14, 15, 16 |
| §10 Frontend | *Separate plan — not this document* |
| §11 Seeding — Flyway reference data, batched runtime seed, fixed `Random`, shaped distribution | 3, 5, 17 |
| §12 Test strategy — every row of the table | 2, 7 (domain); 14–16 (analytics maths); 3–6 (Testcontainers); 12, 14, 15 (query counts); 10 (concurrency); 8–16 (web layer) |
| §14 Success criteria | 17 (seed speed), 12 (page latency), 14–16 (one currency, three HR questions), 18 (clone and run) |

**One deliberate omission.** Spec §4 lists `@BatchSize` on `salary_history` as a backstop. No task adds it, because no task maps a `SalaryHistory` collection — history is fetched through its own repository query, so there is no lazy collection to batch. `hibernate.default_batch_fetch_size=100` remains set in Task 1 as the general net. Adding an annotation to an association that does not exist would be configuration for a requirement that does not exist.

---

## Definition of done

- [ ] `./mvnw test` passes in full, in any execution order.
- [ ] The query-count tests assert exactly 2 statements for a page and exactly 1 for each analytics endpoint.
- [ ] `docker compose up --build` from a clean clone serves `/api/analytics/summary` with `"headcount": 10000`.
- [ ] Every analytics figure in the test suite is an exact expected value, not a non-null assertion.
- [ ] `git log` shows one feature per commit, with the failing test and its implementation as separate commits.
- [ ] No remote is configured. Nothing has been pushed.
- [ ] No commit message contains an AI attribution trailer.
