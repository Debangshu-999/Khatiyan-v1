package com.khatiyan.a_auth.service;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;

/**
 * Low-level provider contract for sending OTPs through one channel.
 */
public interface OtpDeliveryProvider {

    OtpDeliveryProviderType type();

    void sendOtp(String phone, String otp, OtpPurpose purpose);
}
