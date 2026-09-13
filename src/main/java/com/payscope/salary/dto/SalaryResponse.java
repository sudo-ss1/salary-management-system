package com.payscope.salary.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalaryResponse(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom,
                             BigDecimal compaRatio, Long salaryVersion) {
}
