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
