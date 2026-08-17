package com.khatiyan.c_shared.upload;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cloudinary credentials and upload policy.
 *
 * <p>The secret never leaves this process — it signs the upload parameters and
 * the client receives only the resulting signature. That is the whole point of
 * signed direct upload: the device can upload exactly what the server agreed to,
 * and nothing else.
 */
@Component
@ConfigurationProperties(prefix = "app.cloudinary")
public class CloudinaryProperties {

    private String cloudName = "";
    private String apiKey = "";
    private String apiSecret = "";
    private long signatureTtlSeconds = 600;

    /**
     * Trimmed on the way in.
     *
     * <p>A trailing space in the environment file is invisible in an editor and
     * survives every layer that carries it, so it arrives at Cloudinary as part
     * of the key: "Invalid api_key 448412592617111  ". The credentials have no
     * meaningful leading or trailing whitespace, so removing it can only help.
     */
    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    /** False when the keys are absent, so callers can refuse cleanly. */
    public boolean isConfigured() {
        return !cloudName.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
    }

    public String getCloudName() {
        return cloudName;
    }

    public void setCloudName(String cloudName) {
        this.cloudName = clean(cloudName);
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = clean(apiKey);
    }

    public String getApiSecret() {
        return apiSecret;
    }

    public void setApiSecret(String apiSecret) {
        this.apiSecret = clean(apiSecret);
    }

    public long getSignatureTtlSeconds() {
        return signatureTtlSeconds;
    }

    public void setSignatureTtlSeconds(long signatureTtlSeconds) {
        this.signatureTtlSeconds = signatureTtlSeconds;
    }
}
