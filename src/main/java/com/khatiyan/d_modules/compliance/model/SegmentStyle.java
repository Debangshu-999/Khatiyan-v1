package com.khatiyan.d_modules.compliance.model;

/**
 * How a run of clause text is set.
 *
 * <p>Three states, not a boolean, because a value has three fates and the middle
 * one is not "emphasised prose": {@code PLAIN} is the fixed wording,
 * {@code VALUE} is a resolved fact worth finding in a wall of text, and
 * {@code PLACEHOLDER} names a value onboarding will supply.
 *
 * <p>A placeholder is NOT an empty gap — it carries the field's name, the way the
 * reference deed shows "Execution Date" or "Rent Day" underlined where the value
 * will go. On the property's settings screen that is the correct rendering: the
 * owner is reading the shape of every deed they will issue, and each placeholder
 * tells them exactly which fact fills it.
 */
public enum SegmentStyle {
    PLAIN,
    VALUE,
    PLACEHOLDER
}
