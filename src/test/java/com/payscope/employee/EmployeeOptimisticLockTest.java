package com.payscope.employee;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * No threads. Two detached copies reproduce the exact interleaving of a lost
 * update on every run, where a racing thread would be timing-dependent and
 * flaky - see spec section 12.
 */
@IntegrationTest
class EmployeeOptimisticLockTest {

    @Autowired
    EmployeeRepository employees;

    @Test
    void rejects_the_second_of_two_writers_holding_the_same_version() {
        Employee saved = employees.saveAndFlush(Employee.create("E-4001", "First Name",
                "lock1@acme.test", Department.ENGINEERING, "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR,
                EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1)));
        Long id = saved.id();

        Employee writerOne = employees.findById(id).orElseThrow();
        Employee writerTwo = employees.findById(id).orElseThrow();

        writerOne.rename("Renamed By One");
        employees.saveAndFlush(writerOne);

        writerTwo.rename("Renamed By Two");
        assertThatThrownBy(() -> employees.saveAndFlush(writerTwo))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);

        assertThat(employees.findById(id).orElseThrow().fullName()).isEqualTo("Renamed By One");
    }

    @Test
    void increments_the_version_on_every_successful_write() {
        Employee saved = employees.saveAndFlush(Employee.create("E-4002", "Version Person",
                "lock2@acme.test", Department.SALES, "GB", Role.ACCOUNT_EXECUTIVE, Level.MID,
                EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1)));
        assertThat(saved.version()).isZero();

        saved.rename("Version Person Renamed");
        Employee updated = employees.saveAndFlush(saved);

        assertThat(updated.version()).isEqualTo(1L);
    }
}
