package com.khatiyan.d_modules.tenancy.model;

/**
 * How an item is at move-in (user, 2026-11-07): set fresh for every tenancy, never
 * carried over and separate from the damage levels, which are only price tiers.
 *
 * <p>Persisted by name. Never delete a constant.
 */
public enum ItemCondition {
    WORKING,
    DAMAGED,
    BROKEN;

    /** What an old checklist's level reads as: NA working, D1 and D2 damaged, D3 broken. */
    public static ItemCondition fromLevel(com.khatiyan.d_modules.property.model.DamageLevel level) {
        if (level == null || level == com.khatiyan.d_modules.property.model.DamageLevel.NA) {
            return WORKING;
        }
        return level == com.khatiyan.d_modules.property.model.DamageLevel.D3 ? BROKEN : DAMAGED;
    }
}
