package com.khatiyan.d_modules.property.model;

/**
 * How damaged an item is (P1.9.a, user, 2026-10-29). The same four levels for
 * every item. {@code NA} is no damage and costs nothing; D1 to D3 are priced
 * per item, D3 the worst. What each level means is the property's own words
 * ({@code Property#getDamageLevelD1()} and on).
 *
 * <p>Persisted by name on the move-in checklist. Never delete a constant.
 */
public enum DamageLevel {
    NA,
    D1,
    D2,
    D3
}
