package com.payscope.employee.dto;

import com.payscope.employee.Department;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Employee fields only. Salary changes go through POST /employees/{id}/salary,
 * which guards a different row with a different token.
 */
public record UpdateEmployeeRequest(
        @NotBlank @Size(max = 150) String fullName,
        @NotBlank @Email @Size(max = 255) String email,
        @NotNull Department department,
        @NotNull Role role,
        @NotNull Level level,
        @NotNull EmploymentType employmentType,
        @NotNull Long employeeVersion) {
}
