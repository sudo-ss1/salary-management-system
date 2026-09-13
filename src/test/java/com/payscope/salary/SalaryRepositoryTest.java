package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import com.payscope.employee.Department;
import com.payscope.employee.Employee;
import com.payscope.employee.EmployeeRepository;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
@Transactional
class SalaryRepositoryTest {

    private static final ConversionResult INR_CONVERSION =
            new ConversionResult(Money.of("42000.00", "USD"), new BigDecimal("0.01200000"), LocalDate.of(2026, 1, 1));

    @Autowired
    EmployeeRepository employees;

    @Autowired
    SalaryRepository salaries;

    @Autowired
    SalaryHistoryRepository history;

    private Long anEmployeeId(String number, String email) {
        return employees.saveAndFlush(Employee.create(number, "Asha Menon", email, Department.ENGINEERING,
                "IN", Role.SOFTWARE_ENGINEER, Level.SENIOR, EmploymentType.FULL_TIME,
                LocalDate.of(2024, 3, 1))).id();
    }

    @Test
    void persists_the_original_amount_the_converted_amount_and_the_rate_that_produced_it() {
        Long employeeId = anEmployeeId("E-1001", "s1@acme.test");

        salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        Salary found = salaries.findByEmployeeId(employeeId).orElseThrow();
        assertThat(found.original().amount()).isEqualByComparingTo("3500000.00");
        assertThat(found.original().currencyCode()).isEqualTo("INR");
        assertThat(found.baseUsd().amount()).isEqualByComparingTo("42000.00");
        assertThat(found.fxRate()).isEqualByComparingTo("0.01200000");
        assertThat(found.fxRateDate()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    void allows_only_one_current_salary_per_employee() {
        Long employeeId = anEmployeeId("E-1002", "s2@acme.test");
        salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        assertThatThrownBy(() -> salaries.saveAndFlush(Salary.create(employeeId,
                Money.of("4000000.00", "INR"), INR_CONVERSION, LocalDate.of(2026, 6, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() {
        Long employeeId = anEmployeeId("E-1003", "s3@acme.test");

        assertThatThrownBy(() -> salaries.saveAndFlush(Salary.create(employeeId,
                Money.of("0.00", "INR"),
                new ConversionResult(Money.of("0.00", "USD"), new BigDecimal("0.01200000"),
                        LocalDate.of(2026, 1, 1)),
                LocalDate.of(2026, 1, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void archives_the_superseded_row_when_a_salary_is_replaced() {
        Long employeeId = anEmployeeId("E-1004", "s4@acme.test");
        Salary salary = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        SalaryHistory archived = salary.replaceWith(Money.of("4000000.00", "INR"),
                new ConversionResult(Money.of("48000.00", "USD"), new BigDecimal("0.01200000"),
                        LocalDate.of(2026, 1, 1)),
                LocalDate.of(2026, 7, 1));
        history.saveAndFlush(archived);
        salaries.saveAndFlush(salary);

        Salary current = salaries.findByEmployeeId(employeeId).orElseThrow();
        assertThat(current.original().amount()).isEqualByComparingTo("4000000.00");
        assertThat(current.effectiveFrom()).isEqualTo(LocalDate.of(2026, 7, 1));

        List<SalaryHistory> archivedRows = history.findByEmployeeIdOrderByEffectiveToDesc(employeeId);
        assertThat(archivedRows).hasSize(1);
        assertThat(archivedRows.get(0).original().amount()).isEqualByComparingTo("3500000.00");
        assertThat(archivedRows.get(0).effectiveFrom()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(archivedRows.get(0).effectiveTo()).isEqualTo(LocalDate.of(2026, 7, 1));
    }

    @Test
    void keeps_the_rate_frozen_on_an_archived_row_rather_than_recomputing_it() {
        Long employeeId = anEmployeeId("E-1005", "s5@acme.test");
        Salary salary = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        SalaryHistory archived = salary.replaceWith(Money.of("4000000.00", "INR"),
                new ConversionResult(Money.of("52000.00", "USD"), new BigDecimal("0.01300000"),
                        LocalDate.of(2026, 6, 1)),
                LocalDate.of(2026, 7, 1));
        history.saveAndFlush(archived);

        assertThat(archived.fxRate()).isEqualByComparingTo("0.01200000");
        assertThat(archived.baseUsd().amount()).isEqualByComparingTo("42000.00");
    }

    @Test
    void starts_every_salary_at_version_zero() {
        Long employeeId = anEmployeeId("E-1006", "s6@acme.test");

        Salary saved = salaries.saveAndFlush(Salary.create(employeeId, Money.of("3500000.00", "INR"),
                INR_CONVERSION, LocalDate.of(2026, 1, 1)));

        assertThat(saved.version()).isZero();
    }
}
