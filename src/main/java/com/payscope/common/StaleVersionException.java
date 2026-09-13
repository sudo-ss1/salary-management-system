package com.payscope.common;

import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * Carries the version the client should refresh to, so recovering from a 409
 * needs no second round trip - spec section 7.
 */
public class StaleVersionException extends ObjectOptimisticLockingFailureException {

    private final long currentVersion;

    public StaleVersionException(Class<?> type, Object identifier, long currentVersion) {
        super(type, identifier);
        this.currentVersion = currentVersion;
    }

    public long currentVersion() {
        return currentVersion;
    }
}
