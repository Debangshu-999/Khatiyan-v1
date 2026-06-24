package com.khatiyan.a_auth.service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;

import lombok.extern.slf4j.Slf4j;

/**
 * Coordinates OTP delivery across SMS, optional WhatsApp, and optional email.
 *
 * <p>SMS remains the default channel. Additional channels are only used when
 * the caller explicitly requests them and supplies the required recipient data.
 */
@Slf4j
@Service
public class OtpDeliveryService {

    private final Map<OtpDeliveryProviderType, OtpDeliveryProvider> providers;

    public OtpDeliveryService(List<OtpDeliveryProvider> providers) {
        this.providers = new EnumMap<>(OtpDeliveryProviderType.class);
        providers.forEach(provider -> this.providers.put(provider.type(), provider));
    }

    /**
     * Sends the generated OTP through the requested channel combination.
     */
    public void deliverOtp(String phone, String otp, OtpPurpose purpose, OtpDeliveryChannel channel) {
        deliverOtp(phone, null, otp, purpose, channel);
    }

    /**
     * Sends the generated OTP through the requested channel combination.
     */
    public void deliverOtp(String phone, String email, String otp, OtpPurpose purpose, OtpDeliveryChannel channel) {
        OtpDeliveryChannel resolvedChannel = channel == null ? OtpDeliveryChannel.SMS : channel;

        switch (resolvedChannel) {
            case SMS -> deliverSms(phone, otp, purpose);
            case SMS_AND_WHATSAPP -> {
                deliverSms(phone, otp, purpose);
                deliverWhatsappBestEffort(phone, otp, purpose);
            }
            case EMAIL -> deliverEmail(email, otp, purpose);
            case SMS_AND_EMAIL -> {
                deliverSms(phone, otp, purpose);
                deliverEmailBestEffort(email, otp, purpose);
            }
        }
    }

    private void deliverSms(String phone, String otp, OtpPurpose purpose) {
        OtpDeliveryProvider smsProvider = requiredProvider(OtpDeliveryProviderType.SMS);
        smsProvider.sendOtp(phone, otp, purpose);
    }

    private void deliverEmail(String email, String otp, OtpPurpose purpose) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email OTP delivery requested without an email recipient");
        }

        OtpDeliveryProvider emailProvider = requiredProvider(OtpDeliveryProviderType.EMAIL);
        try {
            emailProvider.sendOtp(email, otp, purpose);
        } catch (RuntimeException e) {
            // Log the real cause (SMTP host/port/timeout) with context; the request
            // still surfaces as a generic 500 so SMTP details never reach the user.
            log.error("Email OTP delivery failed email={} purpose={} reason={}", email, purpose, e.getMessage());
            throw e;
        }
    }

    private void deliverWhatsappBestEffort(String phone, String otp, OtpPurpose purpose) {
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

    private void deliverEmailBestEffort(String email, String otp, OtpPurpose purpose) {
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

    private OtpDeliveryProvider requiredProvider(OtpDeliveryProviderType type) {
        OtpDeliveryProvider provider = providers.get(type);
        if (provider == null) {
            throw new IllegalStateException("OTP delivery provider is not configured: " + type);
        }

        return provider;
    }
}
