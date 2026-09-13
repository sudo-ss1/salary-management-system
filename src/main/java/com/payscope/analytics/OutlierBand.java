package com.payscope.analytics;

import com.payscope.common.DomainException;

/** The two directions of the outlier window. In-band ranges are not outliers. */
public enum OutlierBand {
    LT_80, GT_120;

    public static OutlierBand parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("'" + value
                    + "' is not an outlier band. Permitted values: LT_80, GT_120");
        }
    }
}
