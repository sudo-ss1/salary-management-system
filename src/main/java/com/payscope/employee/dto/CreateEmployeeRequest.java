package com.payscope.employee.dto;

import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Creating an employee always creates their first salary. There is no
 * meaningful state in which an employee exists with no pay, and permitting one
 * would force a null branch into every analytics query forever - spec section 8.
 *
 * Note the absence of @PastOrPresent on hireDate: that annotation reads the wall
 * clock. The rule lives in EmployeeService, which uses the injected Clock.
 */
public record CreateEmployeeRequest(
        @NotBlank @Size(max = 20) String employeeNumber,
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotNull Department department,
        @NotBlank @Size(min = 2, max = 2) String countryCode,
        @NotNull Role role,
        @NotNull Level level,
        @NotNull EmploymentType employmentType,
        @NotNull LocalDate hireDate,
        @NotNull @Valid MoneyDto salary,
        @NotNull LocalDate salaryEffectiveFrom) {
}
