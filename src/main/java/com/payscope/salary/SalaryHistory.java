package com.payscope.salary;

import com.payscope.common.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Currency;

@Entity
@Table(name = "salary_history")
public class SalaryHistory {

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

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "change_reason")
    private String changeReason;

    protected SalaryHistory() {
    }

    /**
     * Built from the values being superseded. The rate is copied, never
     * recomputed, so a historical figure stays what it was - see ADR-0001.
     */
    static SalaryHistory of(Long employeeId, Money original, Money baseUsd, BigDecimal fxRate,
                            LocalDate fxRateDate, LocalDate effectiveFrom, LocalDate effectiveTo) {
        SalaryHistory row = new SalaryHistory();
        row.employeeId = employeeId;
        row.amountOriginal = original.amount();
        row.currencyCode = original.currencyCode();
        row.amountBaseUsd = baseUsd.amount();
        row.fxRate = fxRate;
        row.fxRateDate = fxRateDate;
        row.effectiveFrom = effectiveFrom;
        row.effectiveTo = effectiveTo;
        return row;
    }

    public void recordReason(String changeReason) {
        this.changeReason = changeReason;
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
    public LocalDate effectiveTo() { return effectiveTo; }
    public String changeReason() { return changeReason; }
}
