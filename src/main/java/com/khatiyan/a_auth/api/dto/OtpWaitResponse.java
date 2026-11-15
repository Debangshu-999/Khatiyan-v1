package com.khatiyan.a_auth.api.dto;

/** Seconds before the next code may be sent; 0 when it may be sent now. */
public record OtpWaitResponse(long retryAfterSeconds) {}
