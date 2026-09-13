package com.payscope.currency;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "fx_rate")
public class FxRate {

    @EmbeddedId
    private FxRateId id;

    @Column(name = "rate_to_usd")
    private BigDecimal rateToUsd;

    protected FxRate() {
    }

    public String currencyCode() {
        return id.currencyCode();
    }

    public LocalDate rateDate() {
        return id.rateDate();
    }

    public BigDecimal rateToUsd() {
        return rateToUsd;
    }
}
