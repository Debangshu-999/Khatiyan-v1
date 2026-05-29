package com.khatiyan.c_shared.billing;

/**
 * Defines when rent is expected for a monthly billing cycle.
 *
 * <p>
 * Property stores the editable policy. Billing cycles snapshot the value used
 * when they are created so past/current cycles are not changed by later policy
 * edits.
 */
public enum BillingCollectionTiming {
    CYCLE_START
}
