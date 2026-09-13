package com.payscope.employee;

import com.payscope.common.DomainException;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * The closed whitelist of sortable columns. The list runs as a native query, so
 * an unvalidated sort field would be a SQL injection vector - spec section 6.
 */
public enum EmployeeSort {

    FULL_NAME("e.full_name"),
    HIRE_DATE("e.hire_date"),
    SALARY("s.amount_base_usd"),
    COUNTRY("e.country_code"),
    DEPARTMENT("e.department"),
    LEVEL("e.job_level"),
    COMPA_RATIO("compa_ratio");

    private final String column;

    EmployeeSort(String column) {
        this.column = column;
    }

    public String column() {
        return column;
    }

    public static EmployeeSort parse(String value) {
        if (value == null || value.isBlank()) {
            return FULL_NAME;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("Cannot sort by '" + value + "'. Permitted values: "
                    + Arrays.stream(values()).map(Enum::name).collect(Collectors.joining(", ")));
        }
    }
}
