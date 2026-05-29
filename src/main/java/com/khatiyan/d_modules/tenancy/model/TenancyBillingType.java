package com.khatiyan.d_modules.tenancy.model;

/**
 * Billing shape attached to a tenancy.
 *
 * <p>Monthly tenancies generate recurring rent bills. Daily tenancies are
 * temporary stays that bill once at checkout using the property's daily rate.
 */
public enum TenancyBillingType {
    MONTHLY,
    DAILY
}
