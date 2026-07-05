package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Current-month budget standing surfaced in the action center. {@code level} is
 * NONE when there is no budget or spend is comfortably under it, APPROACHING once
 * spend reaches the alert threshold, and EXCEEDED once spend passes the effective
 * budget. {@code overPaise} is non-zero only when EXCEEDED; {@code remainingPaise}
 * is the headroom left (0 when there is no budget, or already exceeded).
 */
public record BudgetAttention(
    BudgetAttentionLevel level,
    long effectiveBudgetPaise,
    long spentPaise,
    long overPaise,
    long remainingPaise
) {
}
