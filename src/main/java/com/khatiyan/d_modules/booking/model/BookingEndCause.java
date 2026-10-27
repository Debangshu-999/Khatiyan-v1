package com.khatiyan.d_modules.booking.model;

/**
 * Why a booking that held a bed came to an end. It decides what happens to a
 * token the property has received, so the side at fault is part of the cause.
 */
public enum BookingEndCause {
    MOVED_IN(false),
    TENANT_CANCELLED(true),
    /** The agreement was left unsigned for its three days. */
    TENANT_DID_NOT_SIGN(true),
    /** The property closed it after the move-in day because nobody came. */
    TENANT_DID_NOT_ARRIVE(true),
    /** Withdrawn because the same person confirmed a booking somewhere else. */
    BOOKED_ELSEWHERE(true),
    MANAGEMENT_CANCELLED(false),
    /** The bed was still occupied after every retry and the tenant opted out. */
    BED_NOT_READY(false),
    /** The property could not host for another reason, such as a room under repair. */
    PROPERTY_CANNOT_HOST(false);

    private final boolean tenantSide;

    BookingEndCause(boolean tenantSide) {
        this.tenantSide = tenantSide;
    }

    /** The tenant walked away, so the property's own refund rule decides. */
    public boolean isTenantSide() {
        return tenantSide;
    }
}
