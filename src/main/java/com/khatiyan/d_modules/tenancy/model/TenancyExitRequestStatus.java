package com.khatiyan.d_modules.tenancy.model;

/**
 * Lifecycle state for a tenancy exit request.
 */
public enum TenancyExitRequestStatus {
    REQUESTED,
    APPROVED,
    REJECTED,
    CANCELLED,
    EXECUTED
}
