package com.khatiyan.c_shared.employment;

/** Stores verification state without retaining raw identity document values. */
public enum IdentityVerificationStatus {
    NOT_STARTED,
    PENDING,
    VERIFIED,
    REJECTED
}
