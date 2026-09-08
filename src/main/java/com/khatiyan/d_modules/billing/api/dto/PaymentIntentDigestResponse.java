package com.khatiyan.d_modules.billing.api.dto;

/**
 * The Live digest tile's three numbers.
 *
 * <p>Deliberately a summary rather than the list: the digest card shows counts
 * and opens the screen that shows the claims.
 */
public record PaymentIntentDigestResponse(
    /** Claims waiting on the owner. */
    long awaitingReview,
    /** What those claims add up to, so the tile can say what is at stake. */
    long awaitingAmountPaise,
    /**
     * Days the oldest claim has been waiting, or 0 when none are.
     *
     * <p>The number that turns a queue into an obligation — a tenant who paid
     * three days ago is still blocked from paying anything else on that bill.
     */
    long oldestWaitingDays,
    /**
     * Claims this owner approved or rejected in the current IST month.
     *
     * <p>Work done, next to work waiting. The tile is on the dashboard whether
     * or not anything is queued, and at zero waiting it would otherwise be three
     * zeroes — this is the number that says the screen is being used.
     */
    long resolvedThisMonth
) {
}
