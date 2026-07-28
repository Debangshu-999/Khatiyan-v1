package com.khatiyan.d_modules.tenancy.model;

/**
 * How an early exit inside the lock-in period is charged. Stamped onto the
 * tenancy from its accepted agreement's lock-in rule.
 *
 * <ul>
 *   <li>{@code REMAINING_TERM} — rent for the days remaining until the lock-in
 *       end, prorated (days / 30 × monthly rent);</li>
 *   <li>{@code FIXED} — a flat amount the owner set.</li>
 * </ul>
 */
public enum EarlyExitPenaltyType {
    REMAINING_TERM,
    FIXED
}
