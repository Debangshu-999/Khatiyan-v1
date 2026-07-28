package com.khatiyan.d_modules.tenancy.model;

public enum TenancyStatus {
    // Created with an agreement but not yet accepted by the tenant: the bed is
    // reserved, but the user is not an active tenant and billing has not started.
    PENDING_ACCEPTANCE,
    ACTIVE,
    ON_NOTICE,
    ON_PREMATURE_NOTICE,
    EXITED,
    EVICTED,
    // A pending tenancy the tenant declined, or that expired before acceptance.
    CANCELLED
}

