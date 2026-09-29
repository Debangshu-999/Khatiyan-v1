package com.khatiyan.a_auth.service;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;

/**
 * Low-level provider contract for sending OTPs through one channel.
 */
public interface OtpDeliveryProvider {

    OtpDeliveryProviderType type();

    void sendOtp(String recipient, String otp, OtpPurpose purpose);

    /**
     * The same, with a line saying what the code is FOR.
     *
     * <p>Most codes need no explanation — "your login code" says it all. A
     * cash-payment code does: it is the tenant agreeing that a specific amount
     * changed hands for a specific bill, and a bare "your code is 482913" lets
     * them agree to an amount they never saw. The detail carries that.
     *
     * <p>Defaults to ignoring it, so a provider that has no template for it yet
     * still delivers the code. When a real SMS provider is added, India's DLT
     * rules require each distinct message to be a registered template, and the
     * cash-payment one has to include this detail.
     */
    default void sendOtp(String recipient, String otp, OtpPurpose purpose, String detail) {
        sendOtp(recipient, otp, purpose);
    }
}
