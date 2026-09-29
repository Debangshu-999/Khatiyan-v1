package com.khatiyan.d_modules.verification.provider;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;
import java.util.zip.GZIPInputStream;

/**
 * Turns the link a provider gives into one the Aadhaar App opens on the same
 * phone.
 *
 * <p>Decentro returns {@code https://maadhaar.com/getIntent?value=<digits>}.
 * The digits are the request JWT, gzip-compressed and written as one base-10
 * number: the form meant for a QR code, which the Aadhaar App's own scanner
 * reads. On the same phone that link goes nowhere. The Aadhaar App (1.5.4)
 * claims no maadhaar.com links, and maadhaar.com does not answer as a website.
 *
 * <p>What the Aadhaar App does claim is {@code pehchaan://webIntentRequest}.
 * Given the digits there, it answered "JWT tag(s) missing or empty: ch, sc,
 * txn, pop, cb", and the decoded JWT carries every one of those. So it gets the
 * JWT itself, under the documented payload key.
 *
 * <p><b>Confirmed on a device (2026-09-27), not from documentation:</b> given
 * {@code ?request=<JWT>} the Aadhaar App read the request and echoed its
 * {@code txn} back. Every other key, and the base-10 number, got "JWT tag(s)
 * missing or empty". UIDAI's public docs do not describe this link.
 *
 * <p>It then answered "Invalid Jwt" to a staging session still inside its
 * validity. Most likely the Play Store Aadhaar App does not trust Decentro's
 * staging signing key. That is with Decentro.
 */
public final class AadhaarIntentLinks {

    /**
     * {@code request} is the key UIDAI documents for the Aadhaar App's intent
     * payload. {@code value} (Decentro's QR key) got "JWT tag(s) missing or
     * empty" with the number and with the JWT alike, so it is not read here.
     */
    private static final String WEB_INTENT = "pehchaan://webIntentRequest?request=";

    private AadhaarIntentLinks() {
    }

    /** The Aadhaar App's own link for this request, or empty when the link is not one we can decode. */
    public static Optional<String> webIntentFor(String providerLink) {
        return requestJwt(providerLink).map(jwt -> WEB_INTENT + jwt);
    }

    /** The request JWT inside a {@code maadhaar.com/...?value=<digits>} link. */
    static Optional<String> requestJwt(String providerLink) {
        if (providerLink == null) {
            return Optional.empty();
        }
        try {
            URI uri = URI.create(providerLink.trim());
            if (uri.getHost() == null || !uri.getHost().equalsIgnoreCase("maadhaar.com")) {
                return Optional.empty();
            }
            String digits = queryValue(uri.getRawQuery(), "value");
            if (digits == null || !digits.matches("\\d+")) {
                return Optional.empty();
            }
            byte[] bytes = new BigInteger(digits).toByteArray();
            if (bytes.length > 1 && bytes[0] == 0) {
                // BigInteger's sign byte, not part of the gzip stream.
                bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
            }
            try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(bytes))) {
                String jwt = new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
                return jwt.split("\\.", -1).length == 3 ? Optional.of(jwt) : Optional.empty();
            }
        } catch (IllegalArgumentException | IOException e) {
            return Optional.empty();
        }
    }

    private static String queryValue(String rawQuery, String name) {
        if (rawQuery == null) {
            return null;
        }
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return pair.substring(eq + 1);
            }
        }
        return null;
    }
}
