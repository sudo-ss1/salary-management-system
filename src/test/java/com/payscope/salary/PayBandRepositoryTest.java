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
