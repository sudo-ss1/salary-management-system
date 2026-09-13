package com.payscope.salary.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalaryHistoryItem(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom,
                                LocalDate effectiveTo, String changeReason) {
}
