package com.khatiyan.d_modules.billing.model;

/**
 * How an owner/manager collected an offline payment for a billing cycle.
 */
public enum ManualPaymentMethod {
    CASH,
    UPI,
    CARD,
    CHEQUE,
    OTHER,
    /** A transfer into the property's bank account (2026-09-28). Persisted by name, never delete. */
    BANK_TRANSFER
}
