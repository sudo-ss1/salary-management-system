package com.payscope.common;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ProblemDetail;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The salary constraints (salary_one_per_employee, salary_amount_positive, ...)
 * are not reachable through POST /employees, so an integration test cannot
 * exercise every branch of onConstraintViolation. This is a plain unit test:
 * no Spring context, no Testcontainers.
 */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    private DataIntegrityViolationException violationFor(String constraintName, String rootMessage) {
        ConstraintViolationException cause = new ConstraintViolationException(rootMessage, null, constraintName);
        return new DataIntegrityViolationException(rootMessage, cause);
    }

    @Test
    void maps_a_duplicate_email_to_a_conflict_naming_the_email() {
        ProblemDetail problem = handler.onConstraintViolation(
                violationFor("employee_email_unique", "duplicate key value violates unique constraint \"employee_email_unique\""));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getDetail()).isEqualTo("That email address is already in use");
    }

    @Test
    void maps_a_second_salary_for_the_same_employee_to_a_conflict() {
        ProblemDetail problem = handler.onConstraintViolation(
                violationFor("salary_one_per_employee", "duplicate key value violates unique constraint \"salary_one_per_employee\""));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getDetail()).isEqualTo("That employee already has a current salary");
    }

    @Test
    void maps_a_check_constraint_violation_to_a_bad_request() {
        ProblemDetail problem = handler.onConstraintViolation(
                violationFor("salary_amount_positive",
                        "new row for relation \"salary\" violates check constraint \"salary_amount_positive\""));

        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getTitle()).isEqualTo("Rule violation");
    }

    @Test
    void maps_an_unrecognised_constraint_to_a_generic_conflict() {
        ProblemDetail problem = handler.onConstraintViolation(
                violationFor("some_future_constraint", "duplicate key value violates unique constraint \"some_future_constraint\""));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getDetail()).isEqualTo("This change conflicts with data that already exists");
    }

    /**
     * Not every DataIntegrityViolationException wraps a Hibernate
     * ConstraintViolationException - a numeric overflow on a numeric(19,4)
     * column, for example, arrives with a DataException cause instead, so
     * there is no constraint name at all. The handler must not crash here.
     */
    @Test
    void maps_a_violation_with_no_constraint_name_to_a_generic_conflict() {
        DataIntegrityViolationException noConstraintName = new DataIntegrityViolationException(
                "numeric field overflow", new RuntimeException("numeric field overflow"));

        ProblemDetail problem = handler.onConstraintViolation(noConstraintName);

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getDetail()).isEqualTo("This change conflicts with data that already exists");
    }

    @Test
    void maps_a_check_violation_with_no_constraint_name_to_a_bad_request_without_the_word_null() {
        DataIntegrityViolationException noConstraintName = new DataIntegrityViolationException(
                "violates check constraint", new RuntimeException("violates check constraint"));

        ProblemDetail problem = handler.onConstraintViolation(noConstraintName);

        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getTitle()).isEqualTo("Rule violation");
        assertThat(problem.getDetail()).isEqualTo("Rejected by a database rule");
    }
}
