package com.khatiyan.d_modules.billing.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * Builds the {@code upi://pay} link a tenant's banking app opens.
 *
 * <p>
 * Pure string construction. Nothing here talks to a bank, and no money passes
 * through this app — the link hands the payee, the amount and a note to whatever
 * UPI app the tenant already has, and the transfer happens between the two of
 * them. That is precisely why this is legal for us to do while the gateway
 * module stays parked.
 */
public final class UpiDeepLink {

    /**
     * Rupees, two decimal places, always.
     *
     * <p>
     * The UPI spec's {@code am} is in RUPEES, not paise, and several banking
     * apps refuse or silently mangle an amount that is not written to two
     * places. Everything else in this codebase is paise, so this conversion is
     * the one place the two units meet.
     */
    private static final int UPI_AMOUNT_SCALE = 2;

    private UpiDeepLink() {
    }

    /**
     * @param vpa           the owner's virtual payment address
     * @param payeeName     shown in the tenant's banking app as who they are paying
     * @param amountPaise   the bill total, in paise
     * @param referenceCode the bill's short code, which becomes the transaction note
     */
    public static String build(String vpa, String payeeName, long amountPaise, String referenceCode) {
        String trimmedVpa = vpa == null ? "" : vpa.trim();
        if (trimmedVpa.isEmpty()) {
            throw new ValidationException("This property has no UPI address set up yet.");
        }
        if (amountPaise <= 0) {
            throw new ValidationException("A payment link needs an amount greater than zero.");
        }

        // Insertion-ordered so the link reads the same every time. Not required
        // by the spec, but a link that reorders itself between builds is
        // needlessly hard to compare in a log or a bug report.
        Map<String, String> params = new LinkedHashMap<>();
        params.put("pa", trimmedVpa);
        if (payeeName != null && !payeeName.isBlank()) {
            params.put("pn", payeeName.trim());
        }
        params.put("am", rupees(amountPaise));
        params.put("cu", "INR");
        if (referenceCode != null && !referenceCode.isBlank()) {
            // The bill's short code, carried in the transaction note. This is
            // what the owner matches against their bank statement, so it is the
            // single thread tying a line in their passbook to a bill in here.
            params.put("tn", referenceCode.trim());
        }

        StringBuilder link = new StringBuilder("upi://pay?");
        boolean first = true;
        for (Map.Entry<String, String> param : params.entrySet()) {
            if (!first) {
                link.append('&');
            }
            first = false;
            link.append(param.getKey()).append('=').append(encode(param.getValue()));
        }
        return link.toString();
    }

    /** Paise to rupees, fixed at two places. */
    static String rupees(long amountPaise) {
        return BigDecimal.valueOf(amountPaise)
                .movePointLeft(2)
                .setScale(UPI_AMOUNT_SCALE, RoundingMode.UNNECESSARY)
                .toPlainString();
    }

    /**
     * Percent-encoding, with {@code +} corrected back to {@code %20}.
     *
     * <p>
     * {@link URLEncoder} writes a space as {@code +}, which is right for a form
     * body and wrong in a URI query — several UPI apps show the plus literally
     * in the payee name and the note. The note is the owner's only way to match
     * a payment to a bill, so it has to survive intact.
     */
    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
