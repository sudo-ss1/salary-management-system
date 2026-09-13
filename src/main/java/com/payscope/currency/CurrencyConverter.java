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
