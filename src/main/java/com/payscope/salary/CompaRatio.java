package com.payscope.salary;

import com.payscope.common.Money;

import java.math.BigDecimal;

/**
 * A salary as a proportion of its band midpoint. Both sides are in the same
 * local currency, so the figure carries no exchange-rate exposure and is
 * comparable across countries - see ADR-0002.
 */
public final class CompaRatio {

    public static final BigDecimal LOW = new BigDecimal("0.80");
    public static final BigDecimal HIGH = new BigDecimal("1.20");

    private CompaRatio() {
    }

    /**
     * Null when the employee's role, level and country combination has no band.
     * Such employees still count in headcount and payroll totals; they are
     * reported through summary.unbandedCount rather than dropped.
     */
    public static BigDecimal of(Money salary, Money bandMid) {
        if (bandMid == null) {
            return null;
        }
        return salary.ratioTo(bandMid);
    }

    public static boolean isOutlier(BigDecimal ratio) {
        if (ratio == null) {
            return false;
        }
        return ratio.compareTo(LOW) < 0 || ratio.compareTo(HIGH) > 0;
    }
}
