package com.payscope.employee;

import com.payscope.common.DomainException;

public record EmployeeQuery(String country, Department department, Level level, EmployeeStatus status,
                            String q, int page, int size, EmployeeSort sort, boolean ascending) {

    public static final int MAX_SIZE = 100;

    public EmployeeQuery {
        if (page < 0) {
            throw new DomainException("Page must not be negative");
        }
        // A client asking for 500 rows has a bug. Quietly returning 100 hides it.
        if (size < 1 || size > MAX_SIZE) {
            throw new DomainException("Page size must be between 1 and " + MAX_SIZE + ", was " + size);
        }
    }

    public int offset() {
        return page * size;
    }
}
