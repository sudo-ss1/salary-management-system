package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.currency.ConversionResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Currency;

@Entity
@Table(name = "salary")
public class Salary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "amount_original")
    private BigDecimal amountOriginal;

    @Column(name = "currency_code")
    private String currencyCode;

    @Column(name = "amount_base_usd")
    private BigDecimal amountBaseUsd;

    @Column(name = "fx_rate")
    private BigDecimal fxRate;

    @Column(name = "fx_rate_date")
    private LocalDate fxRateDate;

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Version
    private Long version;

    protected Salary() {
    }

    public static Salary create(Long employeeId, Money original, ConversionResult converted,
                                LocalDate effectiveFrom) {
        Salary salary = new Salary();
        salary.employeeId = employeeId;
        salary.apply(original, converted, effectiveFrom);
        return salary;
    }

    /**
     * Replaces this salary and returns the superseded values as a history row.
     * The caller persists both inside one transaction - see ADR-0004.
     */
    public SalaryHistory replaceWith(Money original, ConversionResult converted, LocalDate effectiveFrom) {
        SalaryHistory archived = SalaryHistory.of(employeeId, original(), baseUsd(), fxRate, fxRateDate,
                this.effectiveFrom, effectiveFrom);
        apply(original, converted, effectiveFrom);
        return archived;
    }

    private void apply(Money original, ConversionResult converted, LocalDate effectiveFrom) {
        this.amountOriginal = original.amount();
        this.currencyCode = original.currencyCode();
        this.amountBaseUsd = converted.baseUsd().amount();
        this.fxRate = converted.rate();
        this.fxRateDate = converted.rateDate();
        this.effectiveFrom = effectiveFrom;
    }

    public Money original() {
        return Money.of(amountOriginal, Currency.getInstance(currencyCode));
    }

    public Money baseUsd() {
        return Money.of(amountBaseUsd, Currency.getInstance("USD"));
    }

    public Long id() { return id; }
    public Long employeeId() { return employeeId; }
    public BigDecimal fxRate() { return fxRate; }
    public LocalDate fxRateDate() { return fxRateDate; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public Long version() { return version; }
}
