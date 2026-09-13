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
        assertThatThrownBy(() -> converter.toUsd(Money.of("100.00", "GBP"), LocalDate.of(2025, 12, 31)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("GBP")
                .hasMessageContaining("2025-12-31");
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
