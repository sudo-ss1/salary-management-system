package com.payscope.salary;

import com.payscope.common.DomainException;
import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.NotFoundException;
import com.payscope.common.StaleVersionException;
import com.payscope.currency.ConversionResult;
import com.payscope.currency.Country;
import com.payscope.currency.CountryRepository;
import com.payscope.currency.CurrencyConverter;
import com.payscope.employee.Employee;
import com.payscope.employee.EmployeeRepository;
import com.payscope.salary.dto.RecordSalaryRequest;
import com.payscope.salary.dto.SalaryHistoryItem;
import com.payscope.salary.dto.SalaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

@Service
public class SalaryService {

    private final EmployeeRepository employees;
    private final SalaryRepository salaries;
    private final SalaryHistoryRepository history;
    private final PayBandRepository bands;
    private final CountryRepository countries;
    private final CurrencyConverter converter;
    private final Clock clock;

    public SalaryService(EmployeeRepository employees, SalaryRepository salaries,
                         SalaryHistoryRepository history, PayBandRepository bands,
                         CountryRepository countries, CurrencyConverter converter, Clock clock) {
        this.employees = employees;
        this.salaries = salaries;
        this.history = history;
        this.bands = bands;
        this.countries = countries;
        this.converter = converter;
        this.clock = clock;
    }

    /**
     * Closes the current salary into history and installs the new one. Both
     * writes happen here, in one transaction, deriving the history row from the
     * row being replaced - ADR-0004.
     */
    @Transactional
    public SalaryResponse recordRaise(Long employeeId, RecordSalaryRequest request) {
        Employee employee = employees.findByIdForShare(employeeId)
                .orElseThrow(() -> new NotFoundException("No employee with id " + employeeId));

        Salary current = salaries.findByEmployeeId(employeeId)
                .orElseThrow(() -> new IllegalStateException(
                        "Employee " + employeeId + " has no current salary, which creation makes impossible"));

        if (!current.version().equals(request.salaryVersion())) {
            throw new StaleVersionException(Salary.class, employeeId, current.version());
        }

        Country country = countries.findById(employee.countryCode()).orElseThrow();
        Money amount = request.salary().toMoney();
        LocalDate today = LocalDate.now(clock);

        if (!amount.currencyCode().equals(country.currencyCode())) {
            throw new DomainException("Employees in " + country.countryCode() + " are paid in "
                    + country.currencyCode() + ", not " + amount.currencyCode());
        }
        if (!amount.isPositive()) {
            throw new DomainException("Salary must be strictly positive");
        }
        if (!request.effectiveFrom().isAfter(current.effectiveFrom())) {
            throw new DomainException("A new salary must take effect after the current one, which began "
                    + current.effectiveFrom());
        }
        if (request.effectiveFrom().isAfter(today)) {
            throw new DomainException("Effective date " + request.effectiveFrom() + " is in the future");
        }

        ConversionResult converted = converter.toUsd(amount, request.effectiveFrom());
        SalaryHistory archived = current.replaceWith(amount, converted, request.effectiveFrom());
        archived.recordReason(request.changeReason());

        history.saveAndFlush(archived);
        salaries.saveAndFlush(current);

        PayBand band = bands.findByRoleAndLevelAndCountryCode(
                employee.role(), employee.level(), employee.countryCode()).orElse(null);

        return new SalaryResponse(MoneyDto.from(current.original()), MoneyDto.from(current.baseUsd()),
                current.effectiveFrom(),
                CompaRatio.of(current.original(), band == null ? null : band.mid()),
                current.version());
    }

    @Transactional(readOnly = true)
    public List<SalaryHistoryItem> historyFor(Long employeeId) {
        employees.findByIdAndDeletedAtIsNull(employeeId)
                .orElseThrow(() -> new NotFoundException("No employee with id " + employeeId));

        return history.findByEmployeeIdOrderByEffectiveToDesc(employeeId).stream()
                .map(row -> new SalaryHistoryItem(MoneyDto.from(row.original()),
                        MoneyDto.from(row.baseUsd()), row.effectiveFrom(), row.effectiveTo(),
                        row.changeReason()))
                .toList();
    }
}
