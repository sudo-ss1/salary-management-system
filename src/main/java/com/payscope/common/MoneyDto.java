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
