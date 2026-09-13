package com.payscope.seed;

import com.payscope.employee.Level;
import com.payscope.seed.EmployeeGenerator.GeneratedEmployee;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class Seeder {

    private static final Logger log = LoggerFactory.getLogger(Seeder.class);
    // pg_advisory_xact_lock keys are a single flat namespace for the whole
    // database, not scoped to this table or feature - any other code taking an
    // advisory lock anywhere in the app must pick a different constant.
    private static final long ADVISORY_LOCK_KEY = 8_675_309L;
    private static final LocalDate RATE_DATE = LocalDate.of(2026, 1, 1);
    private static final int BATCH_SIZE = 1000;

    // V3__pay_band.sql scales a role's USD base by a level multiplier - PRINCIPAL
    // 2.10, STAFF 1.70. Unbanded rows (PRINCIPAL recruiters/support
    // specialists/accountants - the deliberate gap in that migration) derive
    // their reference salary from the same ratio rather than a flat constant.
    private static final BigDecimal PRINCIPAL_OVER_STAFF =
            new BigDecimal("2.10").divide(new BigDecimal("1.70"), 6, RoundingMode.HALF_UP);

    private final JdbcTemplate jdbc;
    private final SeedProperties properties;
    private final Clock clock;

    public Seeder(JdbcTemplate jdbc, SeedProperties properties, Clock clock) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.clock = clock;
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

        LocalDate today = LocalDate.now(clock);

        insertEmployees(people, ids);
        insertSalaries(people, ids, currencyByCountry, rateByCurrency, bandMidByKey, today);

        log.info("Seeded {} employees in {} ms", count, System.currentTimeMillis() - started);
        return count;
    }

    private void insertEmployees(List<GeneratedEmployee> people, List<Long> ids) {
        // Indexed loop, not people.stream().map(p -> ... people.indexOf(p) ...): indexOf
        // is a linear scan per row, which would turn 10,000 rows into 50 million
        // comparisons.
        List<Object[]> rows = new ArrayList<>(people.size());
        for (int i = 0; i < people.size(); i++) {
            GeneratedEmployee p = people.get(i);
            rows.add(new Object[]{ids.get(i), p.employeeNumber(), p.fullName(), p.email(),
                    p.department().name(), p.countryCode(), p.role().name(), p.level().name(),
                    p.employmentType().name(), Date.valueOf(p.hireDate()), p.status().name()});
        }

        jdbc.batchUpdate("""
                insert into employee (id, employee_number, full_name, email, department, country_code,
                                      job_role, job_level, employment_type, hire_date, status, version)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, rows, BATCH_SIZE, (ps, arg) -> {
            for (int i = 0; i < arg.length; i++) {
                ps.setObject(i + 1, arg[i]);
            }
        });
    }

    private void insertSalaries(List<GeneratedEmployee> people, List<Long> ids,
                                Map<String, String> currencyByCountry, Map<String, BigDecimal> rateByCurrency,
                                Map<String, BigDecimal> bandMidByKey, LocalDate today) {
        List<Object[]> salaries = new ArrayList<>();
        List<Object[]> historyRows = new ArrayList<>();

        for (int i = 0; i < people.size(); i++) {
            GeneratedEmployee person = people.get(i);
            long id = ids.get(i);
            String currency = currencyByCountry.get(person.countryCode());
            BigDecimal rate = rateByCurrency.get(currency);
            LocalDate hireDate = person.hireDate();

            BigDecimal mid = bandMidByKey.get(
                    person.role().name() + "|" + person.level().name() + "|" + person.countryCode());
            BigDecimal reference = mid != null ? mid
                    : unbandedReference(person, bandMidByKey, rate);

            BigDecimal current = reference.multiply(BigDecimal.valueOf(person.bandFactor()))
                    .setScale(2, RoundingMode.HALF_UP);

            // Anchored forward from the hire date, not backward from it: a raise
            // count of n means n one-year steps have already happened, so the
            // current salary cannot still be dated at hire. Capped at "today" (and
            // the raise count reduced with it) so a very recently hired employee -
            // fewer full years elapsed than their random raise count - cannot
            // produce inverted or collapsed intervals.
            long yearsSinceHire = ChronoUnit.YEARS.between(hireDate, today);
            int raiseCount = (int) Math.min(person.raiseCount(), Math.max(0, yearsSinceHire));
            LocalDate currentFrom = hireDate.plusYears(raiseCount);

            // Walk backwards from the current amount to fill in each earlier period:
            // each prior salary is 92% of the one that followed it. periodEnd is the
            // boundary tying period k to period k+1: the current salary itself for
            // the newest history row, the previous history row's effective_from
            // otherwise.
            BigDecimal amount = current;
            LocalDate periodEnd = currentFrom;
            List<Object[]> priors = new ArrayList<>();
            for (int r = raiseCount - 1; r >= 0; r--) {
                BigDecimal earlier = amount.multiply(new BigDecimal("0.92")).setScale(2, RoundingMode.HALF_UP);
                LocalDate periodStart = hireDate.plusYears(r);
                priors.add(new Object[]{id, earlier, currency, earlier.multiply(rate).setScale(2, RoundingMode.HALF_UP),
                        rate, Date.valueOf(RATE_DATE), Date.valueOf(periodStart), Date.valueOf(periodEnd),
                        "Annual review"});
                amount = earlier;
                periodEnd = periodStart;
            }
            historyRows.addAll(priors);

            salaries.add(new Object[]{id, current, currency,
                    current.multiply(rate).setScale(2, RoundingMode.HALF_UP), rate,
                    Date.valueOf(RATE_DATE), Date.valueOf(currentFrom)});
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

    /**
     * The unbanded population is exactly PRINCIPAL x {RECRUITER, SUPPORT_SPECIALIST,
     * ACCOUNTANT} - the deliberate gap in V3__pay_band.sql. Rather than a flat
     * salary regardless of level, derive it from that role's STAFF band in the
     * same country, scaled by PRINCIPAL's multiplier over STAFF's. Only if even
     * the STAFF band is missing - unreachable for the current seed - fall back
     * to a flat USD-equivalent constant.
     */
    private BigDecimal unbandedReference(GeneratedEmployee person, Map<String, BigDecimal> bandMidByKey,
                                         BigDecimal rate) {
        BigDecimal staffMid = bandMidByKey.get(
                person.role().name() + "|" + Level.STAFF.name() + "|" + person.countryCode());
        if (staffMid != null) {
            return staffMid.multiply(PRINCIPAL_OVER_STAFF).setScale(2, RoundingMode.HALF_UP);
        }
        return new BigDecimal("50000").divide(rate, 2, RoundingMode.HALF_UP);
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
