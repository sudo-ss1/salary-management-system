package com.payscope.employee;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
@Transactional
class EmployeeRepositoryTest {

    @Autowired
    EmployeeRepository employees;

    @Autowired
    JdbcTemplate jdbc;

    private Employee anEmployee(String number, String email) {
        return Employee.create(number, "Asha Menon", email, Department.ENGINEERING, "IN",
                Role.SOFTWARE_ENGINEER, Level.SENIOR, EmploymentType.FULL_TIME, LocalDate.of(2024, 3, 1));
    }

    @Test
    void persists_an_employee_and_reads_it_back() {
        Employee saved = employees.saveAndFlush(anEmployee("E-0001", "asha@acme.test"));

        Employee found = employees.findById(saved.id()).orElseThrow();
        assertThat(found.fullName()).isEqualTo("Asha Menon");
        assertThat(found.countryCode()).isEqualTo("IN");
        assertThat(found.level()).isEqualTo(Level.SENIOR);
        assertThat(found.status()).isEqualTo(EmployeeStatus.ACTIVE);
        assertThat(found.deletedAt()).isNull();
    }

    @Test
    void starts_every_employee_at_version_zero() {
        Employee saved = employees.saveAndFlush(anEmployee("E-0002", "v0@acme.test"));

        assertThat(saved.version()).isZero();
    }

    @Test
    void rejects_a_second_active_employee_with_the_same_email() {
        employees.saveAndFlush(anEmployee("E-0003", "clash@acme.test"));

        assertThatThrownBy(() -> employees.saveAndFlush(anEmployee("E-0004", "clash@acme.test")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void treats_email_uniqueness_as_case_insensitive() {
        employees.saveAndFlush(anEmployee("E-0005", "Case@acme.test"));

        assertThatThrownBy(() -> employees.saveAndFlush(anEmployee("E-0006", "case@acme.test")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void frees_an_email_for_reuse_once_the_original_employee_is_soft_deleted() {
        Employee first = employees.saveAndFlush(anEmployee("E-0007", "reuse@acme.test"));
        first.softDelete(Instant.parse("2026-09-12T10:00:00Z"));
        employees.saveAndFlush(first);

        Employee replacement = employees.saveAndFlush(anEmployee("E-0008", "reuse@acme.test"));

        assertThat(replacement.id()).isNotEqualTo(first.id());
    }

    @Test
    void hides_soft_deleted_employees_from_the_undeleted_lookup() {
        Employee employee = employees.saveAndFlush(anEmployee("E-0009", "gone@acme.test"));
        employee.softDelete(Instant.parse("2026-09-12T10:00:00Z"));
        employees.saveAndFlush(employee);

        Optional<Employee> found = employees.findByIdAndDeletedAtIsNull(employee.id());

        assertThat(found).isEmpty();
    }

    @Test
    void keeps_deactivation_separate_from_deletion() {
        Employee employee = employees.saveAndFlush(anEmployee("E-0010", "leaver@acme.test"));
        employee.deactivate();
        employees.saveAndFlush(employee);

        Employee found = employees.findByIdAndDeletedAtIsNull(employee.id()).orElseThrow();
        assertThat(found.status()).isEqualTo(EmployeeStatus.INACTIVE);
        assertThat(found.deletedAt()).isNull();
    }

    @Test
    void rejects_a_department_outside_the_permitted_set() {
        assertThatThrownBy(() -> jdbc.update("""
                insert into employee (employee_number, full_name, email, department, country_code,
                                      job_role, job_level, employment_type, hire_date, status, version)
                values ('E-9999', 'Bad Row', 'bad@acme.test', 'ACCOUNTING', 'IN',
                        'SOFTWARE_ENGINEER', 'SENIOR', 'FULL_TIME', date '2024-01-01', 'ACTIVE', 0)
                """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejects_an_employee_in_a_country_that_does_not_exist() {
        assertThatThrownBy(() -> employees.saveAndFlush(
                Employee.create("E-9998", "Nowhere Person", "nowhere@acme.test", Department.SALES, "ZZ",
                        Role.ACCOUNT_EXECUTIVE, Level.MID, EmploymentType.FULL_TIME, LocalDate.of(2024, 1, 1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
