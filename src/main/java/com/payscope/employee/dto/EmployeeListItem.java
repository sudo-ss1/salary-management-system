package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EmployeeListItem(
        Long id,
        String employeeNumber,
        String fullName,
        String email,
        String department,
        String countryCode,
        String role,
        String level,
        String status,
        MoneyDto salary,
        MoneyDto salaryBaseUsd,
        BigDecimal compaRatio) {
}
