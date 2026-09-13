package com.payscope.employee;

import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import com.payscope.support.QueryCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import com.payscope.common.MoneyDto;
import com.payscope.employee.dto.CreateEmployeeRequest;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The regression guard for N+1. A future lazy traversal reintroducing per-row
 * queries fails here with a number, rather than quietly costing 300 round trips.
 */
@IntegrationTest
@Import(FixedClockConfig.class)
class EmployeeListQueryCountTest {

    @Autowired
    EmployeeService service;

    @Autowired
    QueryCounter queries;

    @Autowired
    DatabaseCleaner cleaner;

    @BeforeEach
    void seedOneHundredAndTwentyEmployees() {
        // Earlier test classes commit employees and nothing rolls them back, so a
        // count assertion sees their rows too. Truncate first.
        cleaner.clean();
        for (int i = 0; i < 120; i++) {
            service.create(new CreateEmployeeRequest(
                    "QC-%04d".formatted(i), "Person %04d".formatted(i), "qc%04d@acme.test".formatted(i),
                    Department.ENGINEERING, "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR,
                    EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1),
                    new MoneyDto("3712500.00", "INR"), LocalDate.of(2024, 3, 1)));
        }
    }

    private EmployeeQuery pageOf(int size) {
        return new EmployeeQuery(null, null, null, null, null, 0, size, EmployeeSort.FULL_NAME, true);
    }

    @Test
    void reads_a_page_of_ten_employees_in_exactly_two_statements() {
        long statements = queries.countStatements(() -> service.search(pageOf(10)));

        assertThat(statements).isEqualTo(2);
    }

    @Test
    void reads_a_page_of_one_hundred_employees_in_exactly_the_same_two_statements() {
        // Independence from page size is the whole point: one projection query
        // plus one count query, never one per row.
        long statements = queries.countStatements(() -> service.search(pageOf(100)));

        assertThat(statements).isEqualTo(2);
    }

    @Test
    void returns_salary_and_compa_ratio_on_every_row_without_a_further_query() {
        PagedResponseAssertions.assertRowsArePopulated(service.search(pageOf(100)));
    }

    /** Kept separate so the query-count assertions above stay unambiguous. */
    static class PagedResponseAssertions {
        static void assertRowsArePopulated(com.payscope.common.PagedResponse<
                com.payscope.employee.dto.EmployeeListItem> page) {
            assertThat(page.content()).hasSize(100);
            assertThat(page.content()).allSatisfy(row -> {
                assertThat(row.salary().amount()).isEqualTo("3712500.00");
                assertThat(row.salaryBaseUsd().amount()).isEqualTo("44550.00");
                assertThat(row.compaRatio()).isEqualByComparingTo("1.0000");
            });
        }
    }
}
