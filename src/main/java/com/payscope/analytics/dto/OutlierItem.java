package com.payscope.analytics.dto;

import com.payscope.common.MoneyDto;

import java.math.BigDecimal;

public record OutlierItem(Long employeeId, String employeeNumber, String fullName, String countryCode,
                          String role, String level, MoneyDto salary, MoneyDto bandMid,
                          BigDecimal compaRatio) {
}
