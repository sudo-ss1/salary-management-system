package com.payscope.analytics.dto;

import com.payscope.common.MoneyDto;

import java.util.List;

public record SummaryResponse(long headcount, MoneyDto totalCostToCompanyUsd, MoneyDto meanBaseUsd,
                              long unbandedCount, List<CompaRatioBucket> compaRatioBuckets) {
}
