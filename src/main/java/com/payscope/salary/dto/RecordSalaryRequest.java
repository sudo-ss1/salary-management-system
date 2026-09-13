package com.payscope.salary.dto;

import com.payscope.common.MoneyDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record RecordSalaryRequest(
        @NotNull @Valid MoneyDto salary,
        @NotNull LocalDate effectiveFrom,
        @Size(max = 200) String changeReason,
        @NotNull Long salaryVersion) {
}
