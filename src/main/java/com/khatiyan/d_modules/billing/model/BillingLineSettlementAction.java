package com.khatiyan.d_modules.billing.model;

/**
 * Describes how a billing line is settled or represented.
 *
 * <p>
 * This allows the tenant-facing cycle to clearly show whether a charge was
 * added to payable amount, deducted from deposit, waived, discounted, or created
 * by the system as rent/daily-stay.
 */
public enum BillingLineSettlementAction {
    SYSTEM_CHARGE,
    ADDED_TO_BILL,
    ADJUSTED_FROM_DEPOSIT,
    WAIVED,
    DISCOUNTED
}
