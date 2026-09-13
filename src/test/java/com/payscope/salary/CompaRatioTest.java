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
