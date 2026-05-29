package com.khatiyan.a_auth.firebase;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;

/**
 * Creates Firebase Admin SDK beans when Firebase phone auth is enabled.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.firebase", name = "enabled", havingValue = "true")
public class FirebaseAuthConfig {

    @Bean
    public FirebaseApp firebaseApp(FirebaseAuthProperties properties) throws IOException {
        if (!FirebaseApp.getApps().isEmpty()) {
            return FirebaseApp.getInstance();
        }

        try (InputStream serviceAccount = serviceAccountStream(properties)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();

            return FirebaseApp.initializeApp(options);
        }
    }

    @Bean
    public FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }

    private InputStream serviceAccountStream(FirebaseAuthProperties properties) throws IOException {
        if (StringUtils.hasText(properties.getServiceAccountJsonBase64())) {
            byte[] decoded = Base64.getDecoder().decode(properties.getServiceAccountJsonBase64());
            return new ByteArrayInputStream(decoded);
        }

        if (StringUtils.hasText(properties.getServiceAccountPath())) {
            return new FileInputStream(properties.getServiceAccountPath());
        }

        throw new IllegalStateException("Firebase service account is not configured");
    }
}
