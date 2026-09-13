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
