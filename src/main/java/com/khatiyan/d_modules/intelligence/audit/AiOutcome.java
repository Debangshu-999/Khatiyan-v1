package com.khatiyan.d_modules.intelligence.audit;

/** See {@link AiInvocation}. Persisted as a string, so constants are never renamed or removed. */
public enum AiOutcome {
    SUCCESS,
    VALIDATION_FAILED,
    REFUSED_BUDGET,
    PROVIDER_ERROR,
    TIMEOUT;
}
