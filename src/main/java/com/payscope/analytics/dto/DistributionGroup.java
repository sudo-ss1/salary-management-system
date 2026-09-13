package com.payscope.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Percentiles are in USD and answer "what does this cost". medianCompaRatio is
 * dimensionless and answers "is this fair". Neither is authoritative for the
 * other's question - ADR-0002.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DistributionGroup(Map<String, String> key, long headcount, MoneyDto p25, MoneyDto p50,
                                MoneyDto p75, MoneyDto p90, MoneyDto mean, BigDecimal medianCompaRatio) {
}
