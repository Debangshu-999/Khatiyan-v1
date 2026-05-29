package com.khatiyan.a_auth.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Tunable limits for layered PIN login protection.
 *
 * <p>In-memory limits slow down bursts while durable DB window limits survive
 * restarts. The permanent account lock threshold lives here as product policy.
 */
@Component
@ConfigurationProperties(prefix = "app.auth.login-rate-limit")
public class LoginRateLimitProperties {

    private int phoneLimitAttempts = 20;
    private int phoneLimitDurationMinutes = 15;
    private int ipLimitAttempts = 100;
    private int ipLimitDurationMinutes = 15;
    private int permanentLockFailedAttempts = 100;

    public int phoneLimitAttempts() {
        return phoneLimitAttempts;
    }

    public void setPhoneLimitAttempts(int phoneLimitAttempts) {
        this.phoneLimitAttempts = phoneLimitAttempts;
    }

    public int phoneLimitDurationMinutes() {
        return phoneLimitDurationMinutes;
    }

    public void setPhoneLimitDurationMinutes(int phoneLimitDurationMinutes) {
        this.phoneLimitDurationMinutes = phoneLimitDurationMinutes;
    }

    public int ipLimitAttempts() {
        return ipLimitAttempts;
    }

    public void setIpLimitAttempts(int ipLimitAttempts) {
        this.ipLimitAttempts = ipLimitAttempts;
    }

    public int ipLimitDurationMinutes() {
        return ipLimitDurationMinutes;
    }

    public void setIpLimitDurationMinutes(int ipLimitDurationMinutes) {
        this.ipLimitDurationMinutes = ipLimitDurationMinutes;
    }

    public int permanentLockFailedAttempts() {
        return permanentLockFailedAttempts;
    }

    public void setPermanentLockFailedAttempts(int permanentLockFailedAttempts) {
        this.permanentLockFailedAttempts = permanentLockFailedAttempts;
    }
}
