package com.khatiyan.a_auth.service.providers;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.service.OtpDeliveryProvider;

import lombok.extern.slf4j.Slf4j;

/**
 * Local-development SMS provider that writes OTP delivery to logs.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.otp.delivery.sms", name = "provider", havingValue = "log", matchIfMissing = true)
public class DevLogSmsOtpDeliveryProvider implements OtpDeliveryProvider {

    @Override
    public OtpDeliveryProviderType type() {
        return OtpDeliveryProviderType.SMS;
    }

    @Override
    public void sendOtp(String phone, String otp, OtpPurpose purpose) {
        log.info("DEV SMS OTP delivery phone={} purpose={} otp={}", phone, purpose, otp);
    }
}
