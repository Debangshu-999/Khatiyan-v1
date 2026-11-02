package com.khatiyan.d_modules.billing.damage;

/**
 * Who answers for a damage (2026-10-29). Always a tenant of the room: one of
 * them, or all of them split equally when nobody owns up. NONE only for what a
 * move-in checklist found, which is never charged.
 */
public enum DamageResponsibility {
    TENANT,
    SPLIT,
    NONE
}
