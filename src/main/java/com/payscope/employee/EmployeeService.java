package com.payscope.employee;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.NotFoundException;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.dto.CreateEmployeeRequest;
import com.payscope.employee.dto.EmployeeDetailResponse;
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

    public EmployeeService(EmployeeRepository employees, SalaryRepository salaries,
                           CountryRepository countries, CurrencyConverter converter,
                           PayBandRepository bands, Clock clock) {
        this.employees = employees;
        this.salaries = salaries;
        this.countries = countries;
        this.converter = converter;
        this.bands = bands;
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
}
