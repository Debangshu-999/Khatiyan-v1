package com.khatiyan.d_modules.verification.provider.decentro;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Decentro's credentials and which of their environments to talk to.
 *
 * <p>Staging and production are different hosts with different keys, so the
 * base URL is configured rather than switched on a flag — a boolean called
 * {@code live} is one typo away from running a test against real money and a
 * real person's Aadhaar.
 */
@Component
@ConfigurationProperties(prefix = "app.verification.decentro")
public class DecentroProperties {

    /**
     * Their staging host by default.
     *
     * <p>The safe one. A deployment that forgot to set this talks to a sandbox
     * and fails visibly, rather than quietly spending money against production.
     */
    private String baseUrl = "https://in.staging.decentro.tech";

    private String clientId = "";
    private String clientSecret = "";

    /**
     * How long to wait for the connection itself.
     *
     * <p>Reaching their edge is fast or it is broken. Five seconds separates a
     * slow network from a dead one.
     */
    private Duration connectTimeout = Duration.ofSeconds(5);

    /**
     * How long to wait for their answer.
     *
     * <p><b>Deliberately finite.</b> With no timeout at all we waited however
     * long Decentro waited on UIDAI — measured at 45 seconds before they gave
     * up — with a tenant staring at a spinner the whole time and a request
     * thread pinned behind it.
     *
     * <p>Thirty seconds is longer than any successful OTP send and shorter than
     * their own patience, so we fail before they do. The cost of being wrong is
     * small: a code that arrives after we gave up leaves an attempt the tenant
     * gets back, because it was never charged.
     */
    private Duration readTimeout = Duration.ofSeconds(30);

    /** Whether there is enough here to make a call at all. */
    public boolean isConfigured() {
        return !baseUrl.isBlank() && !clientId.isBlank() && !clientSecret.isBlank();
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getClientSecret() {
        return clientSecret;
    }

    public void setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
    }
}
