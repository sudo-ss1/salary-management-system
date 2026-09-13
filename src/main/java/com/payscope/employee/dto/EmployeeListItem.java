package com.payscope.employee.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
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
        // A decimal the server computed, not a number to do maths with - crosses
        // the wire as a scaled string so trailing zeros survive, same as money.
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal compaRatio) {
}
