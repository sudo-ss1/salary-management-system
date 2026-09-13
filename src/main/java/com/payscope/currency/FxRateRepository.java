package com.payscope.currency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface FxRateRepository extends JpaRepository<FxRate, FxRateId> {

    /**
     * The rate in force on a given date: the most recent row on or before it.
     */
    Optional<FxRate> findFirstByIdCurrencyCodeAndIdRateDateLessThanEqualOrderByIdRateDateDesc(
            String currencyCode, LocalDate asOf);
}
