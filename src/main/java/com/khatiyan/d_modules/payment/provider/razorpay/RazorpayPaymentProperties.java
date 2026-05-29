package com.khatiyan.d_modules.payment.provider.razorpay;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Razorpay gateway credentials and webhook configuration.
 *
 * <p>Secrets should come from environment variables, never from committed
 * config values.
 */
@Component
@ConfigurationProperties(prefix = "app.payment.razorpay")
public class RazorpayPaymentProperties {

    private String keyId;
    private String keySecret;
    private String webhookSecret;

    public String keyId() {
        return keyId;
    }

    public void setKeyId(String keyId) {
        this.keyId = keyId;
    }

    public String keySecret() {
        return keySecret;
    }

    public void setKeySecret(String keySecret) {
        this.keySecret = keySecret;
    }

    public String webhookSecret() {
        return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
        this.webhookSecret = webhookSecret;
    }
}
