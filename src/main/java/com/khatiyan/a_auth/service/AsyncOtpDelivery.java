package com.khatiyan.a_auth.service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;

import lombok.extern.slf4j.Slf4j;

/**
 * Runs the SECONDARY (best-effort) OTP channels — WhatsApp and email — on a
 * background thread, so a slow or unreachable provider (e.g. an SMTP connect
 * timeout) never blocks the request that already delivered the primary SMS. The
 * caller returns as soon as SMS is sent; these run afterwards and only log on
 * failure.
 *
 * <p>Lives in its own bean on purpose: {@code @Async} is proxy-based, so calling
 * these from within {@link OtpDeliveryService} would bypass the proxy and run
 * synchronously.
 */
@Slf4j
@Component
public class AsyncOtpDelivery {

    private final Map<OtpDeliveryProviderType, OtpDeliveryProvider> providers;

    public AsyncOtpDelivery(List<OtpDeliveryProvider> providers) {
        this.providers = new EnumMap<>(OtpDeliveryProviderType.class);
        providers.forEach(provider -> this.providers.put(provider.type(), provider));
    }

    @Async("taskExecutor")
    public void deliverWhatsappBestEffort(String phone, String otp, OtpPurpose purpose) {
        OtpDeliveryProvider whatsappProvider = providers.get(OtpDeliveryProviderType.WHATSAPP);
        if (whatsappProvider == null) {
            log.warn("WhatsApp OTP provider is not configured phone={} purpose={}", phone, purpose);
            return;
        }

        try {
            whatsappProvider.sendOtp(phone, otp, purpose);
        } catch (RuntimeException e) {
            log.warn(
                    "WhatsApp OTP delivery failed after SMS delivery phone={} purpose={} reason={}",
                    phone,
                    purpose,
                    e.getMessage());
        }
    }

    @Async("taskExecutor")
    public void deliverEmailBestEffort(String email, String otp, OtpPurpose purpose) {
        if (email == null || email.isBlank()) {
            log.warn("Email OTP delivery skipped because recipient is missing purpose={}", purpose);
            return;
        }

        OtpDeliveryProvider emailProvider = providers.get(OtpDeliveryProviderType.EMAIL);
        if (emailProvider == null) {
            log.warn("Email OTP provider is not configured email={} purpose={}", email, purpose);
            return;
        }

        try {
            emailProvider.sendOtp(email, otp, purpose);
        } catch (RuntimeException e) {
            log.warn(
                    "Email OTP delivery failed after SMS delivery email={} purpose={} reason={}",
                    email,
                    purpose,
                    e.getMessage());
        }
    }
}
