package com.khatiyan.d_modules.verification.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Whether the mobile on somebody's Aadhaar is the phone they signed in with.
 *
 * <p><b>UIDAI does not return the number, and does not need to.</b> The offline
 * record carries a hash of it, and the hash is reproducible from values we
 * already hold — so we can confirm a phone we were already given rather than
 * being told a phone we would have to trust. That is a better shape than
 * receiving the number: nothing new about the tenant enters our system, and the
 * answer is still yes or no.
 *
 * <p>The recipe is UIDAI's own, from the paperless offline e-KYC
 * specification:
 *
 * <pre>
 *   h = SHA256(SHA256(mobile + shareCode))     -- once
 *   repeat h = SHA256(h) a further (n - 1) times
 *   where n = the last digit of the Aadhaar number, and n &lt; 2 means once
 * </pre>
 *
 * <p>The iteration count comes from the last digit of the Aadhaar, which we
 * have without storing the number: the reference the provider returns carries
 * the last four digits, and the last of those four is the one we need.
 *
 * <p><b>A mismatch is not a failed verification.</b> People routinely register
 * for an app with a different number from the one linked to their Aadhaar — a
 * work phone, a spouse's, an old SIM they never updated at the enrolment
 * centre. Treating that as fraud would fail honest tenants at the most
 * expensive moment. It is reported, not enforced.
 */
public final class LinkedMobileVerifier {

    private LinkedMobileVerifier() {
    }

    /**
     * Whether {@code phone} is the number behind {@code expectedHash}.
     *
     * @param phone          the tenant's registered number, ten digits, no
     *                       country code — UIDAI hashes the bare number
     * @param shareCode      the code we sent the provider, which salts the hash
     * @param aadhaarLastFour the last four digits from the provider's reference
     * @param expectedHash   the hash UIDAI produced, as returned to us
     * @return false when anything needed is missing, because "we could not
     *         check" and "it did not match" are both "not confirmed" — the
     *         caller distinguishes them by whether it had a hash at all
     */
    public static boolean matches(String phone, String shareCode, String aadhaarLastFour, String expectedHash) {
        if (isBlank(phone) || isBlank(shareCode) || isBlank(aadhaarLastFour) || isBlank(expectedHash)) {
            return false;
        }
        String computed = hash(phone, shareCode, iterationsFor(aadhaarLastFour));
        return computed.equalsIgnoreCase(expectedHash.trim());
    }

    /**
     * How many times UIDAI hashed it.
     *
     * <p>The last digit of the Aadhaar number, and never less than one — an
     * Aadhaar ending 0 or 1 is hashed a single time.
     */
    static int iterationsFor(String aadhaarLastFour) {
        char last = aadhaarLastFour.trim().charAt(aadhaarLastFour.trim().length() - 1);
        if (last < '0' || last > '9') {
            return 1;
        }
        return Math.max(1, last - '0');
    }

    /**
     * SHA-256 of the number and the share code, folded n times.
     *
     * <p>The first round hashes the concatenation twice — that is the spec's
     * {@code SHA256(SHA256(mobile + shareCode))} — and each further round hashes
     * the previous hex digest.
     */
    static String hash(String phone, String shareCode, int iterations) {
        MessageDigest digest = sha256();
        String current = hex(digest.digest((phone + shareCode).getBytes(StandardCharsets.UTF_8)));
        for (int round = 0; round < iterations; round++) {
            current = hex(digest.digest(current.getBytes(StandardCharsets.UTF_8)));
        }
        return current;
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // Every JVM ships SHA-256. If this one does not, nothing else in
            // this application works either.
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    private static String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
