package com.payscope.employee;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.NotFoundException;
import com.payscope.common.PagedResponse;
import com.payscope.common.StaleVersionException;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.dto.CreateEmployeeRequest;
import com.payscope.employee.dto.EmployeeDetailResponse;
import com.payscope.employee.dto.EmployeeListItem;
import com.payscope.employee.dto.UpdateEmployeeRequest;
import com.payscope.salary.CompaRatio;
import com.payscope.salary.PayBand;
import com.payscope.salary.PayBandRepository;
import com.payscope.salary.Salary;
import com.payscope.salary.SalaryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

@Service
public class EmployeeService {

    private final EmployeeRepository employees;
    private final SalaryRepository salaries;
    private final CountryRepository countries;
    private final CurrencyConverter converter;
    private final PayBandRepository bands;
    private final Clock clock;
    private final EmployeeListRepository listRepository;

    public EmployeeService(EmployeeRepository employees, SalaryRepository salaries,
                           CountryRepository countries, CurrencyConverter converter,
                           PayBandRepository bands, Clock clock, EmployeeListRepository listRepository) {
        this.employees = employees;
        this.salaries = salaries;
        this.countries = countries;
        this.converter = converter;
        this.bands = bands;
        this.clock = clock;
        this.listRepository = listRepository;
    }

    @Transactional
    public Long create(CreateEmployeeRequest request) {
        LocalDate today = LocalDate.now(clock);

        if (request.hireDate().isAfter(today)) {
            throw new DomainException("Hire date " + request.hireDate() + " is in the future");
        }

        Country country = countries.findById(request.countryCode())
                .orElseThrow(() -> new DomainException("Unknown country code: " + request.countryCode()));

        Money salary = request.salary().toMoney();

        if (!salary.currencyCode().equals(country.currencyCode())) {
            throw new DomainException("Employees in " + country.countryCode() + " are paid in "
                    + country.currencyCode() + ", not " + salary.currencyCode());
        }
        if (!salary.isPositive()) {
            throw new DomainException("Salary must be strictly positive");
        }
        if (request.salaryEffectiveFrom().isBefore(request.hireDate())) {
            throw new DomainException("Salary cannot take effect before the hire date");
        }
        if (request.salaryEffectiveFrom().isAfter(today)) {
            throw new DomainException("Salary effective date " + request.salaryEffectiveFrom()
                    + " is in the future");
        }

        // saveAndFlush, not save: this is load-bearing, not an optimisation to
        // undo. It forces the insert - and any unique-index violation on
        // employee_number/email - to happen here, inside this method, where it
        // surfaces as a DataIntegrityViolationException ApiExceptionHandler maps
        // to 409. Left to Hibernate's normal flush-at-commit timing, the same
        // violation would surface at transaction commit instead, past the point
        // this method's caller can still turn it into a clean response.
        Employee employee = employees.saveAndFlush(Employee.create(
                request.employeeNumber(), request.fullName(), request.email(), request.department(),
                request.countryCode(), request.role(), request.level(), request.employmentType(),
                request.hireDate()));

        ConversionResult converted = converter.toUsd(salary, request.salaryEffectiveFrom());
        salaries.saveAndFlush(Salary.create(employee.id(), salary, converted, request.salaryEffectiveFrom()));

        return employee.id();
    }

    @Transactional(readOnly = true)
    public EmployeeDetailResponse detail(Long id) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));

        Salary salary = salaries.findByEmployeeId(id)
                .orElseThrow(() -> new IllegalStateException(
                        "Employee " + id + " has no current salary, which creation makes impossible"));

        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                employee.role(), employee.level(), employee.countryCode()).orElse(null);

        return new EmployeeDetailResponse(
                employee.id(), employee.employeeNumber(), employee.fullName(), employee.email(),
                employee.department(), employee.countryCode(), employee.role(), employee.level(),
                employee.employmentType(), employee.hireDate(), employee.status(),
                MoneyDto.from(salary.original()), MoneyDto.from(salary.baseUsd()), salary.effectiveFrom(),
                CompaRatio.of(salary.original(), band == null ? null : band.mid()),
                band == null ? null : MoneyDto.from(band.min()),
                band == null ? null : MoneyDto.from(band.mid()),
                band == null ? null : MoneyDto.from(band.max()),
                employee.version(), salary.version());
    }

    @Transactional
    public EmployeeDetailResponse update(Long id, UpdateEmployeeRequest request) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));

        // Looks redundant next to @Version, but is not: this method reloads the
        // entity fresh from the database inside its own transaction, so it always
        // holds the current row's version. Hibernate's optimistic-lock check
        // compares against whatever version this managed entity already carries,
        // which is this fresh read - it can never observe the version the client
        // actually requested with, so it can never by itself catch a stale
        // request. This explicit comparison against request.employeeVersion() is
        // what does that.
        if (!employee.version().equals(request.employeeVersion())) {
            throw new StaleVersionException(Employee.class, id, employee.version());
        }

        employee.rename(request.fullName());
        employee.changeEmail(request.email());
        employee.reassign(request.department(), request.role(), request.level(), request.employmentType());
        employees.saveAndFlush(employee);

        return detail(id);
    }

    /**
     * The person left the company. The record stays visible and keeps counting
     * in analytics, because last year's payroll legitimately includes leavers.
     * Idempotent, and takes no version: this is a transition to a fixed target
     * state, not a read-modify-write, so there is no lost update to prevent.
     */
    @Transactional
    public EmployeeDetailResponse deactivate(Long id) {
        Employee employee = employees.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("No employee with id " + id));
        employee.deactivate();
        employees.saveAndFlush(employee);
        return detail(id);
    }

    /**
     * The record should not exist. Idempotent: deleting an already-deleted or
     * never-existing id succeeds, because the end state is what was asked for.
     */
    @Transactional
    public void softDelete(Long id) {
        employees.findByIdAndDeletedAtIsNull(id).ifPresent(employee -> {
            employee.softDelete(clock.instant());
            employees.saveAndFlush(employee);
        });
    }

    @Transactional(readOnly = true)
    public PagedResponse<EmployeeListItem> search(EmployeeQuery query) {
        return listRepository.search(query);
    }
}
