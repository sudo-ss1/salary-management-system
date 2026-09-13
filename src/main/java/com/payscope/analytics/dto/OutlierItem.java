package com.payscope.analytics.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.payscope.common.MoneyDto;

import java.math.BigDecimal;

public record OutlierItem(Long employeeId, String employeeNumber, String fullName, String countryCode,
                          String role, String level, MoneyDto salary, MoneyDto bandMid,
                          // A decimal the server computed, not a number to do maths with -
                          // crosses the wire as a scaled string so trailing zeros survive.
                          @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal compaRatio) {
}
