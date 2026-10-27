package com.khatiyan.d_modules.billing.model;

/**
 * Type of money line inside a billing cycle.
 */
public enum BillingCycleLineItemType {
    RENT,
    DAILY_STAY,
    DEPOSIT,
    EXTRA_CHARGE,
    LATE_FEE,
    DISCOUNT,
    /**
     * A booking token the property already held when the stay began, taken
     * off the first bill. Money received, not a discount: it has its own
     * amount on the bill and is never counted with discounts.
     */
    BOOKING_TOKEN
}
