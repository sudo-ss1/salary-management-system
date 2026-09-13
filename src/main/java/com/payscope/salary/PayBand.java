package com.payscope.salary;

import com.payscope.common.Money;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.Currency;

@Entity
@Table(name = "pay_band")
public class PayBand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_role")
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_level")
    private Level level;

    @Column(name = "country_code")
    private String countryCode;

    @Column(name = "currency_code")
    private String currencyCode;

    @Column(name = "band_min")
    private BigDecimal bandMin;

    @Column(name = "band_mid")
    private BigDecimal bandMid;

    @Column(name = "band_max")
    private BigDecimal bandMax;

    protected PayBand() {
    }

    public Money min() {
        return Money.of(bandMin, Currency.getInstance(currencyCode));
    }

    public Money mid() {
        return Money.of(bandMid, Currency.getInstance(currencyCode));
    }

    public Money max() {
        return Money.of(bandMax, Currency.getInstance(currencyCode));
    }

    public Role role() { return role; }
    public Level level() { return level; }
    public String countryCode() { return countryCode; }
    public String currencyCode() { return currencyCode; }
}
