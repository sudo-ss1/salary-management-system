package com.payscope.analytics;

import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

/** The four filter dimensions, shared by all three analytics endpoints. */
public record AnalyticsFilter(String country, Department department, Role role, Level level,
                              EmployeeStatus status) {
}
