package com.khatiyan.a_auth.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Tunable limits for layered PIN login protection.
 *
 * <p>In-memory limits slow down bursts while durable DB window limits survive
 * restarts. Progressive account lockout policy lives here as product policy.
 */
@Component
@ConfigurationProperties(prefix = "app.auth.login-rate-limit")
public class LoginRateLimitProperties {

    private int phoneLimitAttempts = 20;
    private int phoneLimitDurationMinutes = 15;
    private int ipLimitAttempts = 100;
    private int ipLimitDurationMinutes = 15;
    private int permanentLockFailedAttempts = 100;
    private int progressiveLockFailedAttempts = 5;
    private List<Integer> progressiveLockDurationsMinutes = new ArrayList<>(List.of(5, 15, 30, 60, 1440));

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

    public int progressiveLockFailedAttempts() {
        return progressiveLockFailedAttempts;
    }

    public void setProgressiveLockFailedAttempts(int progressiveLockFailedAttempts) {
        this.progressiveLockFailedAttempts = progressiveLockFailedAttempts;
    }

    public List<Integer> progressiveLockDurationsMinutes() {
        return progressiveLockDurationsMinutes;
    }

    public void setProgressiveLockDurationsMinutes(List<Integer> progressiveLockDurationsMinutes) {
        this.progressiveLockDurationsMinutes = progressiveLockDurationsMinutes == null
                ? new ArrayList<>()
                : new ArrayList<>(progressiveLockDurationsMinutes);
    }

    public Duration lockDurationForFailedAttempt(int failedAttempts) {
        if (progressiveLockFailedAttempts <= 0
                || failedAttempts < progressiveLockFailedAttempts
                || failedAttempts % progressiveLockFailedAttempts != 0
                || progressiveLockDurationsMinutes.isEmpty()) {
            return Duration.ZERO;
        }

        int index = Math.min(
                (failedAttempts / progressiveLockFailedAttempts) - 1,
                progressiveLockDurationsMinutes.size() - 1);
        return Duration.ofMinutes(progressiveLockDurationsMinutes.get(index));
    }
}
