package com.khatiyan.d_modules.billing.api.dto;

/**
 * Everything the tenant's Pay Now button needs, in one call.
 *
 * <p>One endpoint rather than "try it and read the error": the button has to
 * know whether to render at all, and discovering that by firing a request and
 * being refused is a worse first impression than not offering it.
 */
public record TenantPaymentStateResponse(
    /** False when the property offers no payment route — no button at all. */
    boolean upiAvailable,

    /**
     * Whether a {@code upi://pay} link can be built.
     *
     * <p>Narrower than {@code upiAvailable}: a property with only a QR can be
     * paid by scanning but has no link to fire, so "Scan and pay" is hidden and
     * the QR stands on its own.
     */
    boolean payLinkAvailable,

    /** How to pay. Null when the property accepts none of the routes. */
    PayeeDetailsResponse payee,

    /**
     * The open attempt, or null.
     *
     * <p>Non-null means the button is blocked and the decision modal is what the
     * tenant should see instead — including the case where they closed it last
     * time without answering.
     */
    PaymentIntentResponse liveIntent
) {
}
