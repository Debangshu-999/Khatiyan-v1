package com.khatiyan.d_modules.verification.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;

import org.junit.jupiter.api.Test;

/**
 * Decentro's QR-form link, turned into the Aadhaar App's own link.
 *
 * <p>Seen 2026-09-27: the Aadhaar App opened on {@code pehchaan://webIntentRequest}
 * but, given the base-10 number, answered "JWT tag(s) missing or empty: ch,
 * sc, txn, pop, cb". The decoded JWT carries all of them.
 */
class AadhaarIntentLinksTest {

    private static final String JWT = "eyJhbGciOiJSUzI1NiJ9.eyJ0eG4iOiJ4In0.c2ln";

    private static String qrForm(String jwt) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(jwt.getBytes(StandardCharsets.UTF_8));
        }
        return "https://maadhaar.com/getIntent?value=" + new BigInteger(1, out.toByteArray());
    }

    @Test
    void theQrFormBecomesTheAadhaarAppsOwnLinkWithTheJwt() throws Exception {
        assertThat(AadhaarIntentLinks.webIntentFor(qrForm(JWT)))
                .contains("pehchaan://webIntentRequest?request=" + JWT);
    }

    @Test
    void aLinkThatIsNotTheQrFormIsLeftAlone() {
        assertThat(AadhaarIntentLinks.webIntentFor("http://192.168.1.229:8080/api/v1/verification/dev-sessions/x"))
                .isEmpty();
        assertThat(AadhaarIntentLinks.webIntentFor("https://maadhaar.com/getIntent?value=not-digits")).isEmpty();
        assertThat(AadhaarIntentLinks.webIntentFor("https://maadhaar.com/getIntent?value=12345")).isEmpty();
        assertThat(AadhaarIntentLinks.webIntentFor(null)).isEmpty();
    }
}
