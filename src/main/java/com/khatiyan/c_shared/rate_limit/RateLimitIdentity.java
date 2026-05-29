package com.khatiyan.c_shared.rate_limit;

/**
 * Defines which caller identity should own a central API rate-limit bucket.
 */
public enum RateLimitIdentity {
    IP,
    USER_OR_IP
}
