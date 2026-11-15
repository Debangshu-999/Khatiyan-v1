package com.khatiyan.d_modules.property.model;

/**
 * How damaged an item is (P1.9.a, user, 2026-10-29). The same four levels for
 * every item. {@code NA} is no damage and costs nothing; D1 to D3 are priced
 * per item, D3 the worst.
 *
 * <p>What each level means is fixed for the whole system (user, 2026-11-07), the
 * same words the app shows. It was each property's own words, kept in
 * {@code Property#getDamageLevelD1()} and on, which nothing reads any more.
 *
 * <p>Persisted by name on the move-in checklist. Never delete a constant.
 */
public enum DamageLevel {
    NA("The item is as it was handed over. Everyday use that leaves no mark is not damage. It costs nothing."),
    D1("Marks, stains, scuffs or a loose part. Cleaning or a small fix puts it right, and it still works as it should."),
    D2("Cracked, torn, dented or not working properly. It needs a repair before the next person can use it."),
    D3("It cannot be repaired, or it is gone. It has to be replaced. This is the most damage an item can have.");

    private final String description;

    DamageLevel(String description) {
        this.description = description;
    }

    public String description() {
        return description;
    }
}
