package com.khatiyan.d_modules.food.model;

/**
 * A food profile's diet, picked from a fixed list (2026-09-28).
 *
 * <p>The profile's name is free text ("Veg basic", "Veg premium"), so two
 * profiles can share a category. The app draws the profile's mark from this,
 * where it used to guess from the name.
 *
 * <p>Persisted by name. Never delete a constant: stored rows would stop loading.
 */
public enum FoodProfileCategory {
    VEG,
    NON_VEG,
    JAIN,
    PESCATARIAN,
    EGGETARIAN,
    /** None of the five. Drawn with the plain fork-and-knife mark. */
    OTHER
}
