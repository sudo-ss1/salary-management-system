package com.payscope.currency;

import com.payscope.common.Money;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The converted amount plus the rate that produced it. Callers persist all three
 * onto the salary row so amount_base_usd stays reproducible - see ADR-0001.
 */
public record ConversionResult(Money baseUsd, BigDecimal rate, LocalDate rateDate) {
}
