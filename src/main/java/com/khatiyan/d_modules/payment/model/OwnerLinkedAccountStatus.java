package com.khatiyan.d_modules.payment.model;

/** Lifecycle of an owner's Razorpay Route payout account. */
public enum OwnerLinkedAccountStatus {
    /** Bank details captured; gateway linked-account not yet activated. */
    PENDING,
    /** Linked account active and eligible to receive Route transfers. */
    ACTIVE,
    /** Gateway rejected activation; owner must fix details and retry. */
    FAILED
}
