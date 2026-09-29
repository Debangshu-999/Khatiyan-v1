package com.khatiyan.d_modules.billing.api.dto;

import java.time.Instant;

/**
 * A cash-payment code has been sent to the tenant.
 *
 * @param sentTo the number it went to, masked to its last four digits, so the
 *     owner can say "check the text on your phone ending 3110" without the
 *     whole number being shown on a screen the tenant may be looking at
 * @param amountPaise what the code confirms — the bill's total when it was sent
 * @param expiresAt after which a new code has to be sent
 */
public record CashPaymentCodeResponse(
    String sentTo,
    long amountPaise,
    Instant expiresAt
) {
}
