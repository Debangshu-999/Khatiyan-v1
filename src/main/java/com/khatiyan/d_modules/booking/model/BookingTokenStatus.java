package com.khatiyan.d_modules.booking.model;

/**
 * Where a booking's token stands. No money passes through this app: the tenant
 * pays the property directly, and this records what each side says happened.
 *
 * <p>Refunds are not tracked (user, 2026-10-28). Money the property must give
 * back ends as {@link #REFUND_DUE}, "Refund owed", and paying it is the
 * property's own business. Persisted, so constants are never removed.
 */
public enum BookingTokenStatus {
    /** The owner holds the bed without a token. */
    NOT_REQUIRED,
    /** Terms agreed, nothing paid yet. */
    DUE,
    /** The tenant says they paid; the property has not answered. */
    CLAIMED,
    /** The property refused the claim. It is still owed. */
    NOT_RECEIVED,
    /** The property confirmed receipt, which confirms the booking. */
    RECEIVED,
    /** The tenant moved in and it came off the first bill. */
    ADJUSTED,
    /** The property keeps it. Shown as "Non refundable". */
    KEPT,
    /** The property owes it back. Shown as "Refund owed". Final: the app does not follow the refund. */
    REFUND_DUE,
    /** @deprecated Refunds are not tracked since 2026-10-28. Rows were moved to {@link #REFUND_DUE}. */
    @Deprecated
    REFUND_SENT,
    /** @deprecated Refunds are not tracked since 2026-10-28. Rows were moved to {@link #REFUND_DUE}. */
    @Deprecated
    REFUNDED,
    /**
     * The guest did not arrive and the property holds the token. The handler
     * decides: refund it (owed) or keep it (non refundable). "Action pending"
     * (user, 2026-10-28).
     */
    DECISION_PENDING;

    /** The tenant may still pay, or say they have. */
    public boolean isOwed() {
        return this == DUE || this == NOT_RECEIVED;
    }

    /** Nothing more can happen to it. */
    public boolean isSettled() {
        return this == NOT_REQUIRED || this == ADJUSTED || this == KEPT || this == REFUND_DUE
                || this == REFUND_SENT || this == REFUNDED;
    }
}
