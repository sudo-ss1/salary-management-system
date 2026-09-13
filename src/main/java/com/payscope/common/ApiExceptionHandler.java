package com.payscope.common;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    public record FieldError(String field, String message) {
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail onValidationFailure(MethodArgumentNotValidException e) {
        List<FieldError> errors = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new FieldError(f.getField(), f.getDefaultMessage()))
                .toList();

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Validation failed");
        problem.setDetail("One or more fields are invalid");
        problem.setProperty("errors", errors);
        return problem;
    }

    /**
     * An unparseable enum in a request body arrives here. Spring's default is a
     * 500, which is indefensible for a client mistake, so the permitted values
     * are listed instead.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail onUnreadableBody(HttpMessageNotReadableException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Malformed request");
        problem.setDetail(rootMessage(e));
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail onBadParameter(MethodArgumentTypeMismatchException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Invalid parameter");
        problem.setDetail(rootMessage(e));
        return problem;
    }

    @ExceptionHandler(DomainException.class)
    ProblemDetail onDomainRuleViolation(DomainException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Rule violation");
        problem.setDetail(e.getMessage());
        return problem;
    }

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail onNotFound(NotFoundException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setTitle("Not found");
        problem.setDetail(e.getMessage());
        return problem;
    }

    /** Constraint name -> the message a client can actually act on. */
    private static final Map<String, String> UNIQUE_CONFLICTS = Map.of(
            "employee_email_unique", "That email address is already in use",
            "employee_number_unique", "That employee number is already in use",
            "salary_one_per_employee", "That employee already has a current salary");

    private static final String GENERIC_CONFLICT =
            "This change conflicts with data that already exists";

    /**
     * Uniqueness is enforced by a partial unique index, never by a
     * SELECT-then-INSERT pre-check, which loses under concurrency - ADR-0007.
     *
     * A unique violation is a genuine conflict and maps to 409. A check
     * violation is invalid data that the service layer should have rejected
     * first, so it maps to 400 - reporting it as a conflict would tell the
     * client to retry something that can never succeed.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail onConstraintViolation(DataIntegrityViolationException e) {
        String constraint = e.getCause() instanceof ConstraintViolationException violation
                ? violation.getConstraintName() : null;
        String cause = e.getMostSpecificCause().getMessage();

        if (cause != null && cause.contains("violates check constraint")) {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
            problem.setTitle("Rule violation");
            problem.setDetail(constraint == null
                    ? "Rejected by a database rule"
                    : "Rejected by the database rule " + constraint);
            return problem;
        }

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        // Guarded rather than getOrDefault(constraint, ...): UNIQUE_CONFLICTS is a
        // Map.of(...), and those throw NullPointerException on a null key instead
        // of returning the default. A DataIntegrityViolationException whose cause
        // is not a Hibernate ConstraintViolationException - a numeric overflow,
        // say - has no constraint name, and crashing here would turn a graceful
        // 409 into a 500.
        problem.setDetail(constraint == null
                ? GENERIC_CONFLICT
                : UNIQUE_CONFLICTS.getOrDefault(constraint, GENERIC_CONFLICT));
        return problem;
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail onStaleVersion(OptimisticLockingFailureException e) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setTitle("Conflict");
        problem.setDetail("This record changed since you loaded it. Reload and try again.");
        return problem;
    }

    private String rootMessage(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause.getMessage();
    }
}
