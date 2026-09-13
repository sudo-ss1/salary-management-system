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

    @Autowired Seeder seeder;
    @Autowired JdbcTemplate jdbc;
    @Autowired DatabaseCleaner cleaner;

    @BeforeEach
    void startFromEmpty() {
        cleaner.clean();
    }

    @Test
    void writes_one_employee_and_one_salary_per_requested_row() {
        seeder.seed();

        assertThat(jdbc.queryForObject("select count(*) from employee", Integer.class)).isEqualTo(500);
        assertThat(jdbc.queryForObject("select count(*) from salary", Integer.class)).isEqualTo(500);
    }

    @Test
    void produces_the_same_population_on_every_run_for_a_given_seed() {
        seeder.seed();
        String firstName = jdbc.queryForObject(
                "select full_name from employee order by id limit 1", String.class);
        BigDecimal firstSalary = jdbc.queryForObject(
                "select s.amount_original from salary s join employee e on e.id = s.employee_id"
                        + " order by e.id limit 1", BigDecimal.class);

        cleaner.clean();
        seeder.seed();

        assertThat(jdbc.queryForObject("select full_name from employee order by id limit 1", String.class))
                .isEqualTo(firstName);
        assertThat(jdbc.queryForObject("select s.amount_original from salary s"
                + " join employee e on e.id = s.employee_id order by e.id limit 1", BigDecimal.class))
                .isEqualByComparingTo(firstSalary);
    }

    @Test
    void does_nothing_on_a_second_run_rather_than_doubling_the_population() {
        seeder.seed();

        int written = seeder.seed();

        assertThat(written).isZero();
        assertThat(jdbc.queryForObject("select count(*) from employee", Integer.class)).isEqualTo(500);
    }

    @Test
    void gives_every_employee_a_salary_in_their_own_countrys_currency() {
        seeder.seed();

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
        seeder.seed();

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
        seeder.seed();

        Integer juniors = jdbc.queryForObject(
                "select count(*) from employee where job_level = 'JUNIOR'", Integer.class);
        Integer principals = jdbc.queryForObject(
                "select count(*) from employee where job_level = 'PRINCIPAL'", Integer.class);

        assertThat(juniors).isGreaterThan(principals);
    }

    @Test
    void gives_some_employees_a_salary_history_so_timelines_are_not_empty() {
        seeder.seed();

        Integer historyRows = jdbc.queryForObject("select count(*) from salary_history", Integer.class);

        assertThat(historyRows).isGreaterThan(50);
    }

    @Test
    void spreads_employees_across_every_country() {
        seeder.seed();

        Integer countries = jdbc.queryForObject(
                "select count(distinct country_code) from employee", Integer.class);

        assertThat(countries).isEqualTo(6);
    }

    @Test
    void pays_an_unbanded_principal_more_than_a_banded_senior_in_the_same_role() {
        // RECRUITER, SUPPORT_SPECIALIST and ACCOUNTANT have no PRINCIPAL band -
        // the deliberate gap in V3__pay_band.sql. Before the fix, the fallback was
        // a flat $50,000-equivalent regardless of level, so an unbanded principal
        // could earn roughly what a junior earns. Compared on amount_base_usd so
        // the comparison is currency-neutral across countries.
        seeder.seed();

        BigDecimal principalAvg = jdbc.queryForObject("""
                select avg(s.amount_base_usd) from employee e join salary s on s.employee_id = e.id
                where e.job_level = 'PRINCIPAL'
                  and e.job_role in ('RECRUITER', 'SUPPORT_SPECIALIST', 'ACCOUNTANT')
                """, BigDecimal.class);
        BigDecimal seniorAvg = jdbc.queryForObject("""
                select avg(s.amount_base_usd) from employee e join salary s on s.employee_id = e.id
                where e.job_level = 'SENIOR'
                  and e.job_role in ('RECRUITER', 'SUPPORT_SPECIALIST', 'ACCOUNTANT')
                """, BigDecimal.class);

        assertThat(principalAvg).isNotNull();
        assertThat(seniorAvg).isNotNull();
        assertThat(principalAvg).isGreaterThan(seniorAvg);
    }

    @Test
    void never_dates_a_raise_before_employment_or_leaves_everyone_unraised_since_hire() {
        // Every history period must fall within employment and be non-inverted,
        // and the current salary must have started somewhere between the hire
        // date and today - not frozen at the hire date for eleven years.
        seeder.seed();

        Integer badHistory = jdbc.queryForObject("""
                select count(*) from salary_history h
                join employee e on e.id = h.employee_id
                where h.effective_from < e.hire_date
                   or h.effective_from >= h.effective_to
                """, Integer.class);
        assertThat(badHistory).isZero();

        Integer badCurrent = jdbc.queryForObject("""
                select count(*) from salary s
                join employee e on e.id = s.employee_id
                where s.effective_from < e.hire_date
                   or s.effective_from > current_date
                """, Integer.class);
        assertThat(badCurrent).isZero();

        Integer everyoneUnraised = jdbc.queryForObject("""
                select count(*) from salary s
                join employee e on e.id = s.employee_id
                where s.effective_from = e.hire_date
                """, Integer.class);
        // Some very recently hired employees legitimately still have
        // effective_from == hire_date; the whole population must not.
        Integer total = jdbc.queryForObject("select count(*) from salary", Integer.class);
        assertThat(everyoneUnraised).isLessThan(total);
    }
}
