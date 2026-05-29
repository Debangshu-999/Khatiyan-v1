package com.khatiyan.d_modules.payment.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * Runtime configuration for the payment module.
 *
 * <p>The default provider controls which gateway is used when the frontend
 * does not explicitly request one.
 */
@Component
@ConfigurationProperties(prefix = "app.payment")
public class PaymentProperties {

    private PaymentProviderType defaultProvider = PaymentProviderType.RAZORPAY;
    private String currency = "INR";
    private int orderExpiryMinutes = 10;

    public PaymentProviderType defaultProvider() {
        return defaultProvider;
    }

    public void setDefaultProvider(PaymentProviderType defaultProvider) {
        this.defaultProvider = defaultProvider;
    }

    public String currency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public int orderExpiryMinutes() {
        return orderExpiryMinutes;
    }

    public void setOrderExpiryMinutes(int orderExpiryMinutes) {
        this.orderExpiryMinutes = orderExpiryMinutes;
    }
}
