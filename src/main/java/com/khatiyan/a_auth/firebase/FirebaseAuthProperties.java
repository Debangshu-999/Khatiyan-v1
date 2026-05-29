package com.khatiyan.a_auth.firebase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Firebase Admin SDK configuration for phone-auth token verification.
 *
 * <p>The service account can be supplied either as a local file path for
 * development or as base64-encoded JSON for deployment environments.
 */
@Component
@ConfigurationProperties(prefix = "app.firebase")
public class FirebaseAuthProperties {

    private boolean enabled;
    private String serviceAccountPath;
    private String serviceAccountJsonBase64;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getServiceAccountPath() {
        return serviceAccountPath;
    }

    public void setServiceAccountPath(String serviceAccountPath) {
        this.serviceAccountPath = serviceAccountPath;
    }

    public String getServiceAccountJsonBase64() {
        return serviceAccountJsonBase64;
    }

    public void setServiceAccountJsonBase64(String serviceAccountJsonBase64) {
        this.serviceAccountJsonBase64 = serviceAccountJsonBase64;
    }
}
