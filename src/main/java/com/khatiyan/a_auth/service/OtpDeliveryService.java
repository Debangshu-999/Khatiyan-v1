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
 * Coordinates OTP delivery across SMS and optional WhatsApp.
 *
 * <p>SMS is treated as mandatory. WhatsApp is an additional convenience
 * channel when the client asks for it, so WhatsApp failure does not invalidate
 * an OTP if SMS succeeded.
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
        OtpDeliveryProvider smsProvider = requiredProvider(OtpDeliveryProviderType.SMS);
        smsProvider.sendOtp(phone, otp, purpose);

        if (channel == OtpDeliveryChannel.SMS_AND_WHATSAPP) {
            deliverWhatsappBestEffort(phone, otp, purpose);
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

    private OtpDeliveryProvider requiredProvider(OtpDeliveryProviderType type) {
        OtpDeliveryProvider provider = providers.get(type);
        if (provider == null) {
            throw new IllegalStateException("OTP delivery provider is not configured: " + type);
        }

        return provider;
    }
}
