package com.payscope.seed;

import com.payscope.seed.EmployeeGenerator.GeneratedEmployee;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
public class Seeder {

    private static final Logger log = LoggerFactory.getLogger(Seeder.class);
    private static final long ADVISORY_LOCK_KEY = 8_675_309L;
    private static final LocalDate RATE_DATE = LocalDate.of(2026, 1, 1);
    private static final int BATCH_SIZE = 1000;

    private final JdbcTemplate jdbc;
    private final SeedProperties properties;

    public Seeder(JdbcTemplate jdbc, SeedProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
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
