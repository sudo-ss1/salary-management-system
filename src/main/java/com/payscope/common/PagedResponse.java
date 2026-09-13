package com.payscope.common;

import java.util.List;

/**
 * Deliberately not a serialized Spring PageImpl: Spring Data declines to treat
 * that shape as a stable contract, and its JSON leaks Pageable internals.
 */
public record PagedResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PagedResponse<T> of(List<T> content, int page, int size, long totalElements) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) totalElements / size);
        return new PagedResponse<>(content, page, size, totalElements, totalPages);
    }
}
