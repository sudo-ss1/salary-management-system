package com.payscope.common;

/**
 * A business rule was violated. Mapped to HTTP 400 by ApiExceptionHandler.
 * Distinct from a field-shape failure, which Bean Validation reports instead.
 */
public class DomainException extends RuntimeException {
    public DomainException(String message) {
        super(message);
    }
}
