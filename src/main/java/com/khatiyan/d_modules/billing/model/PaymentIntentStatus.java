package com.khatiyan.d_modules.billing.model;

/**
 * Where a tenant's payment claim has got to.
 *
 * <p>
 * Two of these are <b>live</b> — {@link #CREATED} and {@link #TENANT_CONFIRMED}
 * — and a live intent is what blocks the Pay Now button. The other three are
 * terminal and leave the bill free for a fresh attempt. That split is enforced
 * by a partial unique index on the billing cycle, not only in code, because the
 * block is the whole point of the record.
 */
public enum PaymentIntentStatus {

    /**
     * The link was built and handed to the tenant's banking app. Nobody has said
     * what happened yet.
     *
     * <p>
     * This is also where an intent STAYS when the tenant closes the decision
     * modal without choosing. That is deliberate: they left the app to pay, and
     * we do not know whether they did. The bill goes on showing an open attempt
     * next time they look at it, and the button stays blocked until they answer.
     */
    CREATED,

    /** The tenant said it did not go through. The bill is theirs to try again. */
    TENANT_CANCELLED,

    /**
     * The tenant says the money is sent, with or without evidence.
     *
     * <p>
     * Still live, so the button stays blocked — claiming success must not let
     * someone pay twice. The bill sits at {@code CONFIRMATION_PENDING} until the
     * owner rules on it.
     */
    TENANT_CONFIRMED,

    /** The owner found it in their bank statement. The bill is paid. */
    OWNER_VERIFIED,

    /**
     * The owner could not find it.
     *
     * <p>
     * Terminal rather than a return to CREATED: the claim was made and refused,
     * and that pair is the record. A tenant who wants to try again gets a NEW
     * intent, so the history reads as a sequence of attempts rather than one row
     * that changed its mind.
     */
    OWNER_REJECTED;

    /** Whether an intent in this state blocks a fresh payment attempt. */
    public boolean isLive() {
        return this == CREATED || this == TENANT_CONFIRMED;
    }
}
