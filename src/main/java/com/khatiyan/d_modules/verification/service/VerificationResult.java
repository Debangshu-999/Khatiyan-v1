package com.khatiyan.d_modules.verification.service;

import com.khatiyan.d_modules.verification.model.VerificationGrant;

/**
 * What submitting a code achieved.
 *
 * <p>A returned value rather than an exception, because every outcome here is
 * ordinary. A wrong code, an expired one, a name that does not match — these
 * are things that happen when you ask a person to read a text message, and the
 * attempt has been spent and paid for either way.
 *
 * @param verified whether the grant now stands verified
 * @param message  what to tell the tenant. Null when it passed — a success
 *                 needs no sentence, and the screen says so itself.
 */
public record VerificationResult(boolean verified, String message, VerificationGrant grant) {

    public static VerificationResult verified(VerificationGrant grant) {
        return new VerificationResult(true, null, grant);
    }

    /**
     * It did not pass, and here is the check as it now stands.
     *
     * <p>The grant travels on a failure too, because the tenant's next question
     * is always "how many tries do I have left" — and answering it from a copy
     * the app fetched before the attempt would be off by exactly this one.
     */
    public static VerificationResult failed(String message, VerificationGrant grant) {
        return new VerificationResult(false, message, grant);
    }
}
