package com.khatiyan.d_modules.payment.provider;

/**
 * Provider-neutral result of a linked-account creation attempt.
 *
 * <p>{@code active} means the account can receive Route transfers now.
 * {@code providerAccountId} may be present while activation is still pending
 * on the gateway side.
 */
public record LinkedAccountResult(
        String providerAccountId,
        boolean active,
        String failureReason
) {
    public static LinkedAccountResult pending(String providerAccountId) {
        return new LinkedAccountResult(providerAccountId, false, null);
    }

    public static LinkedAccountResult active(String providerAccountId) {
        return new LinkedAccountResult(providerAccountId, true, null);
    }

    public static LinkedAccountResult failed(String failureReason) {
        return new LinkedAccountResult(null, false, failureReason);
    }
}
