package com.payscope.currency;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

@Embeddable
public class FxRateId implements Serializable {

    private String currencyCode;
    private LocalDate rateDate;

    protected FxRateId() {
    }

    public FxRateId(String currencyCode, LocalDate rateDate) {
        this.currencyCode = currencyCode;
        this.rateDate = rateDate;
    }

    public String currencyCode() {
        return currencyCode;
    }

    public LocalDate rateDate() {
        return rateDate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FxRateId other)) return false;
        return Objects.equals(currencyCode, other.currencyCode) && Objects.equals(rateDate, other.rateDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(currencyCode, rateDate);
    }
}
