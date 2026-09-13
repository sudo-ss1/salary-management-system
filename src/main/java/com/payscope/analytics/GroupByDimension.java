package com.payscope.analytics;

import com.payscope.common.DomainException;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The closed set of grouping dimensions. Capped at two: four would produce a
 * cartesian product no reader can use, and the cap is a 400 rather than a
 * surprise - spec section 8.
 */
public enum GroupByDimension {

    DEPARTMENT("e.department", "department"),
    COUNTRY("e.country_code", "country"),
    ROLE("e.job_role", "role"),
    LEVEL("e.job_level", "level");

    public static final int MAX_DIMENSIONS = 2;

    private final String column;
    private final String key;

    GroupByDimension(String column, String key) {
        this.column = column;
        this.key = key;
    }

    public String column() {
        return column;
    }

    public String key() {
        return key;
    }

    public static List<GroupByDimension> parse(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        if (values.size() > MAX_DIMENSIONS) {
            throw new DomainException("Group by at most two dimensions, was given " + values.size());
        }
        return values.stream().map(GroupByDimension::parseOne).toList();
    }

    private static GroupByDimension parseOne(String value) {
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("Cannot group by '" + value + "'. Permitted values: "
                    + Arrays.stream(values()).map(Enum::name).collect(Collectors.joining(", ")));
        }
    }
}
