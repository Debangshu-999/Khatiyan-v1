package com.khatiyan.d_modules.verification.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Runtime configuration for tenant verification.
 *
 * <p>Off by default, like the balance it spends from. A half-configured
 * identity check is worse than none: it takes an owner's money and fails a
 * tenant at the last step of onboarding.
 */
@Component
@ConfigurationProperties(prefix = "app.verification")
public class VerificationProperties {

    /**
     * The shortest limit any provider imposes on the purpose string.
     *
     * <p>Decentro's. Enforced for every provider rather than only that one,
     * because a purpose that cannot be sent to the vendor we use is not a
     * working configuration whoever happens to be selected today.
     */
    public static final int MAX_PURPOSE_LENGTH = 50;

    private boolean enabled = false;

    /**
     * Which adapter answers.
     *
     * <p>{@code DEV} is the default and talks to nobody. Naming the provider
     * rather than inferring it from whichever credentials happen to be set
     * means a missing secret fails loudly at startup instead of silently
     * falling back to a fake one in production.
     */
    private String provider = "DEV";

    /**
     * Why we are asking, stated to the provider and recorded by UIDAI.
     *
     * <p>The offline verification framework requires a purpose, and it must be
     * the real one. This is the sentence that would be read back to us if
     * anybody ever audited what we used Aadhaar for.
     *
     * <p><b>Keep it under 50 characters.</b> Decentro rejects anything longer
     * with {@code error_long_purpose_length}, and it rejects it on the FIRST
     * call — so a purpose one character too long does not degrade the service,
     * it stops every check in the country. {@link #MAX_PURPOSE_LENGTH} is
     * enforced at startup rather than discovered by a tenant.
     */
    private String purpose = "Tenant identity verification for rental agreement";

    /**
     * Salts the hash UIDAI computes over the mobile and email.
     *
     * <p>Ours, not the tenant's, which is what makes the returned mobile hash
     * reproducible on our side — see LinkedMobileVerifier. Blank means no share
     * code is sent and the phone check simply cannot run.
     */
    private String shareCode = "";

    /**
     * How long a code is good for.
     *
     * <p>Ten minutes, matching what the providers document. Held here so the
     * sweep that closes abandoned attempts and the provider agree.
     */
    private int otpValidityMinutes = 10;

    /**
     * How many times one tenant may try in a day.
     *
     * <p>Attempts cost the owner money, and a tenant who can retry without
     * limit is a tenant who can spend someone else's balance. Separate from the
     * granted count, which is the owner's decision — this one is the floor
     * under it.
     */
    private int maxAttemptsPerDay = 5;

    /** Seconds a tenant must wait before asking for another code. */
    private int resendCooldownSeconds = 60;

    /**
     * The name the DEV provider returns.
     *
     * <p>Only reachable with {@code provider: DEV}, and it exists so the
     * passing path can be exercised without naming a test tenant "DEV TEST
     * USER". Set it to the tenant you are testing with and the strict match
     * succeeds.
     */
    private String devName = "DEV TEST USER";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getPurpose() {
        return purpose;
    }

    public void setPurpose(String purpose) {
        this.purpose = purpose;
    }

    public String getShareCode() {
        return shareCode;
    }

    public void setShareCode(String shareCode) {
        this.shareCode = shareCode;
    }

    public int getOtpValidityMinutes() {
        return otpValidityMinutes;
    }

    public void setOtpValidityMinutes(int otpValidityMinutes) {
        this.otpValidityMinutes = otpValidityMinutes;
    }

    public int getMaxAttemptsPerDay() {
        return maxAttemptsPerDay;
    }

    public void setMaxAttemptsPerDay(int maxAttemptsPerDay) {
        this.maxAttemptsPerDay = maxAttemptsPerDay;
    }

    public String getDevName() {
        return devName;
    }

    public void setDevName(String devName) {
        this.devName = devName;
    }

    public int getResendCooldownSeconds() {
        return resendCooldownSeconds;
    }

    public void setResendCooldownSeconds(int resendCooldownSeconds) {
        this.resendCooldownSeconds = resendCooldownSeconds;
    }
}
