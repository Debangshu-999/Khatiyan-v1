package com.khatiyan.d_modules.verification.provider;

import java.time.Instant;

/**
 * The provider sent a code.
 *
 * @param providerTransactionId their handle for this exchange, needed to submit
 *                              the code against it
 * @param linkedMobileHint      the last few digits of the phone it went to, so
 *                              the tenant knows which handset to check. Null
 *                              when the provider does not say.
 * @param expiresAt             when the code stops working
 */
public record OtpChallenge(String providerTransactionId, String linkedMobileHint, Instant expiresAt) {
}
