package com.khatiyan.d_modules.verification.provider;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import com.khatiyan.d_modules.verification.provider.decentro.DecentroAadhaarOkycProvider;
import com.khatiyan.d_modules.verification.provider.decentro.DecentroProperties;
import com.khatiyan.d_modules.verification.service.VerificationProperties;

/**
 * Picks the adapter by name, and says so out loud.
 *
 * <p><b>Named rather than inferred.</b> Choosing the provider from whichever
 * credentials happen to be present would mean a missing secret silently falls
 * back to the one that talks to nobody — and a production deployment quietly
 * verifying every tenant against a stub is the worst failure this module has.
 * An unknown name fails at startup instead.
 */
@Configuration
public class VerificationProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(VerificationProviderConfig.class);

    @Bean
    public AadhaarOkycProvider aadhaarOkycProvider(
            VerificationProperties properties,
            DecentroProperties decentro,
            RestClient.Builder restClientBuilder,
            Clock clock) {

        requirePurposeFits(properties.getPurpose());

        String name = properties.getProvider() == null ? "" : properties.getProvider().trim().toUpperCase();
        AadhaarOkycProvider provider = switch (name) {
            case "DEV", "" -> new DevAadhaarOkycProvider(clock, properties.getDevName());
            case "DECENTRO" -> new DecentroAadhaarOkycProvider(restClientBuilder, decentro, properties, clock);
            default -> throw new IllegalStateException(
                    "Unknown verification provider '" + properties.getProvider()
                            + "'. Set app.verification.provider to one this build has an adapter for.");
        };

        // Secrets are reported as present or absent, never printed. "The button
        // does nothing" is otherwise a question only a debugger can answer, and
        // the answer is always one of these.
        log.info(
                "Verification config enabled={} provider={} shareCodePresent={} otpValidityMinutes={}",
                properties.isEnabled(),
                provider.name(),
                !properties.getShareCode().isBlank(),
                properties.getOtpValidityMinutes());
        if ("DECENTRO".equals(provider.name())) {
            log.info(
                    "Decentro config baseUrl={} clientIdPresent={} clientSecretPresent={}",
                    decentro.getBaseUrl(),
                    !decentro.getClientId().isBlank(),
                    !decentro.getClientSecret().isBlank());
        }
        return provider;
    }

    /**
     * Refuses a purpose no provider will accept, at startup.
     *
     * <p>Found the hard way: a default one character over the limit meant every
     * single call failed on its first field, and the adapter reported it as the
     * service being unreachable. A configuration that cannot work should not
     * reach a tenant to find out.
     */
    private static void requirePurposeFits(String purpose) {
        if (purpose == null || purpose.isBlank()) {
            throw new IllegalStateException(
                    "app.verification.purpose must say why Aadhaar is being used. Offline verification requires it.");
        }
        if (purpose.length() > VerificationProperties.MAX_PURPOSE_LENGTH) {
            throw new IllegalStateException(
                    "app.verification.purpose is " + purpose.length() + " characters. Providers reject anything over "
                            + VerificationProperties.MAX_PURPOSE_LENGTH + ", on the first call.");
        }
    }
}
