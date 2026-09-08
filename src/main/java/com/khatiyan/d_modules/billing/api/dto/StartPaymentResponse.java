package com.khatiyan.d_modules.billing.api.dto;

/**
 * A freshly opened attempt, and how to pay it.
 *
 * <p>The link is built server-side and handed over whole. Building it on the
 * client would put the amount formatting and the note encoding in two places,
 * and both are things that quietly corrupt a payment rather than fail loudly.
 */
public record StartPaymentResponse(
    PaymentIntentResponse intent,

    /**
     * The {@code upi://pay} URI to open, or null.
     *
     * <p>Null when the property has a QR or a number but no address — there is
     * nothing to fire, and the tenant pays by scanning instead.
     */
    String upiLink,

    /** The QR and identifiers to show alongside, or instead of, the link. */
    PayeeDetailsResponse payee
) {
}
