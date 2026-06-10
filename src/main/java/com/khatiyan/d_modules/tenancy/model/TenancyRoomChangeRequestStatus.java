package com.khatiyan.d_modules.tenancy.model;

/**
 * Lifecycle state for a tenant-initiated room change request.
 */
public enum TenancyRoomChangeRequestStatus {
    REQUESTED,
    APPROVED,
    REJECTED,
    CANCELLED,
    EXECUTED
}
