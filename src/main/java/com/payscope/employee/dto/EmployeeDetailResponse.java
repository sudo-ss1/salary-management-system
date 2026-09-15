package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
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
        // The rate this salary was converted at and the day it was recorded.
        // ADR-0001 freezes both onto the row so a historical figure cannot move
        // when rates do; exposing them is what makes that auditable rather than
        // merely true - the screen can say which rate produced the USD amount.
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal fxRate,
        LocalDate fxRateDate,
        LocalDate salaryEffectiveFrom,
        // A decimal the server computed, not a number to do maths with - crosses
        // the wire as a scaled string so trailing zeros survive, same as money.
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal compaRatio,
        MoneyDto bandMin,
        MoneyDto bandMid,
        MoneyDto bandMax,
        Long employeeVersion,
        Long salaryVersion) {
}
