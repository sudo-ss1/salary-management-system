package com.payscope.salary.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SalaryResponse(MoneyDto salary, MoneyDto salaryBaseUsd, LocalDate effectiveFrom,
                             // A decimal the server computed, not a number to do maths with -
                             // crosses the wire as a scaled string so trailing zeros survive.
                             @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal compaRatio,
                             Long salaryVersion) {
}
