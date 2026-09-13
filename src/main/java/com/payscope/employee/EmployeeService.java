package com.payscope.employee;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.dto.CreateEmployeeRequest;
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
    private final Clock clock;

    public EmployeeService(EmployeeRepository employees, SalaryRepository salaries,
                           CountryRepository countries, CurrencyConverter converter, Clock clock) {
        this.employees = employees;
        this.salaries = salaries;
        this.countries = countries;
        this.converter = converter;
        this.clock = clock;
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

        Employee employee = employees.saveAndFlush(Employee.create(
                request.employeeNumber(), request.fullName(), request.email(), request.department(),
                request.countryCode(), request.role(), request.level(), request.employmentType(),
                request.hireDate()));

        ConversionResult converted = converter.toUsd(salary, request.salaryEffectiveFrom());
        salaries.saveAndFlush(Salary.create(employee.id(), salary, converted, request.salaryEffectiveFrom()));

        return employee.id();
    }
}
