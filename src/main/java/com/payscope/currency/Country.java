package com.payscope.currency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "country")
public class Country {

    @Id
    @Column(name = "country_code")
    private String countryCode;

    private String name;

    @Column(name = "currency_code")
    private String currencyCode;

    protected Country() {
    }

    public String countryCode() {
        return countryCode;
    }

    public String name() {
        return name;
    }

    public String currencyCode() {
        return currencyCode;
    }
}
