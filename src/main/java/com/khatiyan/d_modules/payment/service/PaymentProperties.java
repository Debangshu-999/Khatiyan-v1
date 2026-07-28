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

    // Razorpay Route payout split. OFF by default: until Route is enabled on the
    // Razorpay account, the tenant simply pays the rent to the single configured
    // account (today's behaviour). ON: the owner's share is split to their linked
    // account and the platform + gateway fee is retained (owner-borne fee model).
    private boolean routeEnabled = false;
    // Khatiyan's fee, as basis points of the bill. Owner-borne — netted from the
    // owner's payout, so the tenant always pays exactly the bill. Bounded at both
    // ends: the floor avoids sub-rupee fees on tiny bills, the cap keeps a premium
    // bed from paying several times more for identical service.
    private int platformFeeBps = 100;
    private long platformFeeMinPaise = 500;
    private long platformFeeMaxPaise = 10_000;

    // Fallback only. The gateway fee is passed through at its real value, read
    // from the captured payment (Razorpay reports fee incl. GST, and the GST
    // portion separately). This estimate — 2% + 18% GST — exists so the number is
    // configurable if we ever have to settle without the actual figure; the
    // preferred behaviour is to defer the transfer rather than guess.
    private int gatewayFeeFallbackBps = 236;

    public PaymentProviderType defaultProvider() {
        return defaultProvider;
    }

    public boolean routeEnabled() {
        return routeEnabled;
    }

    public void setRouteEnabled(boolean routeEnabled) {
        this.routeEnabled = routeEnabled;
    }

    /**
     * Khatiyan's fee for a bill of {@code amountPaise}, clamped to the configured
     * floor and cap. Never exceeds the bill itself.
     */
    public long platformFeeFor(long amountPaise) {
        long fee = Math.round(amountPaise * platformFeeBps / 10_000.0);
        fee = Math.max(fee, platformFeeMinPaise);
        fee = Math.min(fee, platformFeeMaxPaise);
        return Math.min(fee, amountPaise);
    }

    public int platformFeeBps() {
        return platformFeeBps;
    }

    public void setPlatformFeeBps(int platformFeeBps) {
        this.platformFeeBps = platformFeeBps;
    }

    public long platformFeeMinPaise() {
        return platformFeeMinPaise;
    }

    public void setPlatformFeeMinPaise(long platformFeeMinPaise) {
        this.platformFeeMinPaise = platformFeeMinPaise;
    }

    public long platformFeeMaxPaise() {
        return platformFeeMaxPaise;
    }

    public void setPlatformFeeMaxPaise(long platformFeeMaxPaise) {
        this.platformFeeMaxPaise = platformFeeMaxPaise;
    }

    public int gatewayFeeFallbackBps() {
        return gatewayFeeFallbackBps;
    }

    public void setGatewayFeeFallbackBps(int gatewayFeeFallbackBps) {
        this.gatewayFeeFallbackBps = gatewayFeeFallbackBps;
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
