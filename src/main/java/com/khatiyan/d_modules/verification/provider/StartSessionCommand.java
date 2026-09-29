package com.khatiyan.d_modules.verification.provider;

/**
 * What an Aadhaar App session is opened with.
 *
 * @param referenceId        ours, unique per attempt; comes back on the result
 * @param name               the name on the tenancy, as the provider asks for it
 * @param purpose            stated to UIDAI; 50 characters at most
 * @param callbackUrl        where the provider posts the result, carrying a one-time token
 * @param returnUrl          where the Aadhaar App sends the tenant back
 * @param faceAuthentication ask for the Aadhaar App's face check (proof of presence)
 */
public record StartSessionCommand(
        String referenceId,
        String name,
        String purpose,
        String callbackUrl,
        String returnUrl,
        boolean faceAuthentication) {
}
