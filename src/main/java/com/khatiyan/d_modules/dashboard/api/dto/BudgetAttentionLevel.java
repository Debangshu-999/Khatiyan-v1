package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Where a property's month-to-date spend sits against its effective budget, for
 * the action center. NONE covers both "no budget set" and "comfortably under".
 */
public enum BudgetAttentionLevel {
    NONE,
    APPROACHING,
    EXCEEDED
}
