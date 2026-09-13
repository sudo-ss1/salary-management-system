package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

import java.math.BigDecimal;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record EmployeeDetailResponse(
        Long id,
        String employeeNumber,
        String fullName,
        String email,
        Department department,
        String countryCode,
        Role role,
        Level level,
        EmploymentType employmentType,
        LocalDate hireDate,
        EmployeeStatus status,
        MoneyDto salary,
        MoneyDto salaryBaseUsd,
        LocalDate salaryEffectiveFrom,
        BigDecimal compaRatio,
        MoneyDto bandMin,
        MoneyDto bandMid,
        MoneyDto bandMax,
        Long employeeVersion,
        Long salaryVersion) {
}
