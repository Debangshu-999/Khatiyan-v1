package com.khatiyan.a_auth.service.providers;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.service.OtpDeliveryProvider;

import lombok.extern.slf4j.Slf4j;

/**
 * Local-development email provider that writes OTP delivery to logs.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.otp.delivery.email", name = "provider", havingValue = "log", matchIfMissing = true)
public class DevLogEmailOtpDeliveryProvider implements OtpDeliveryProvider {

    @Override
    public OtpDeliveryProviderType type() {
        return OtpDeliveryProviderType.EMAIL;
    }

    @Override
    public void sendOtp(String recipient, String otp, OtpPurpose purpose) {
        log.info("DEV Email OTP delivery email={} purpose={} otp={}", recipient, purpose, otp);
    }
}
