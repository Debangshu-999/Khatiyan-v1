package com.khatiyan.a_auth.model;

/**
 * Reason an OTP was issued.
 *
 * <p>The purpose is stored with each OTP so a code requested for one
 * flow, such as PIN reset, cannot be reused for another flow, such as
 * daily login.
 */
public enum OtpPurpose {
    LOGIN,
    PIN_RESET,
    NEW_DEVICE
}
