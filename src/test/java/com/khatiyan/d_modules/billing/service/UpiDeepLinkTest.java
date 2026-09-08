package com.khatiyan.d_modules.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The link is the whole product here — there is no gateway to fall back on.
 *
 * <p>If the amount is written wrong the tenant's banking app refuses it or, far
 * worse, accepts a different number than the bill said. If the note is mangled
 * the owner cannot match the payment to a bill in their statement, which is the
 * only thing making manual verification workable.
 */
class UpiDeepLinkTest {

    @Test
    void buildsTheStandardUpiUri() {
        String link = UpiDeepLink.build("owner@okaxis", "Anita Rao", 13_500_00L, "BIL-2026-000042");

        assertThat(link).isEqualTo(
                "upi://pay?pa=owner%40okaxis&pn=Anita%20Rao&am=13500.00&cu=INR&tn=BIL-2026-000042");
    }

    // ---- The amount -------------------------------------------------------

    /** `am` is RUPEES, not paise. Sending paise would ask for 100x the bill. */
    @Test
    void writesTheAmountInRupees() {
        assertThat(UpiDeepLink.rupees(13_500_00L)).isEqualTo("13500.00");
        assertThat(UpiDeepLink.rupees(1_00L)).isEqualTo("1.00");
    }

    /** Always two places. Apps refuse or mangle "8000.5" and "8000". */
    @Test
    void alwaysWritesTwoDecimalPlaces() {
        assertThat(UpiDeepLink.rupees(8_000_50L)).isEqualTo("8000.50");
        assertThat(UpiDeepLink.rupees(8_000_00L)).isEqualTo("8000.00");
        assertThat(UpiDeepLink.rupees(7L)).isEqualTo("0.07");
    }

    @Test
    void refusesAnAmountOfZeroOrLess() {
        assertThatThrownBy(() -> UpiDeepLink.build("owner@okaxis", "Anita", 0L, "BIL-1"))
                .isInstanceOf(ValidationException.class);
    }

    // ---- Encoding ---------------------------------------------------------

    /**
     * A space must be %20, never +. URLEncoder writes + — correct for a form
     * body, wrong in a URI query — and UPI apps then show the plus literally in
     * the payee name and the note.
     */
    @Test
    void encodesSpacesAsPercentTwentyNotPlus() {
        String link = UpiDeepLink.build("owner@okaxis", "Sky Prime PG", 5_000_00L, "BIL 2026 7");

        assertThat(link).contains("pn=Sky%20Prime%20PG");
        assertThat(link).contains("tn=BIL%202026%207");
        assertThat(link).doesNotContain("+");
    }

    @Test
    void encodesTheAtSignInTheAddress() {
        assertThat(UpiDeepLink.build("owner@okaxis", null, 100_00L, "BIL-1")).contains("pa=owner%40okaxis");
    }

    // ---- What may be missing ---------------------------------------------

    @Test
    void refusesAMissingAddress() {
        assertThatThrownBy(() -> UpiDeepLink.build("   ", "Anita", 100_00L, "BIL-1"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("UPI address");
    }

    /** The payee name is a courtesy. A link without one still pays. */
    @Test
    void omitsAnAbsentPayeeName() {
        String link = UpiDeepLink.build("owner@okaxis", null, 100_00L, "BIL-1");

        assertThat(link).doesNotContain("pn=");
        assertThat(link).isEqualTo("upi://pay?pa=owner%40okaxis&am=100.00&cu=INR&tn=BIL-1");
    }

    @Test
    void trimsSurroundingWhitespace() {
        assertThat(UpiDeepLink.build("  owner@okaxis  ", "  Anita  ", 100_00L, "  BIL-1  "))
                .isEqualTo("upi://pay?pa=owner%40okaxis&pn=Anita&am=100.00&cu=INR&tn=BIL-1");
    }
}
