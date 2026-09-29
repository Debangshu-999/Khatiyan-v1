package com.khatiyan.d_modules.analytics.metric;

/**
 * One slice, segment, bar or bucket.
 *
 * @param key   a stable code the app turns into display text ("UPI", "OVERDUE")
 * @param label set ONLY for names people typed: payees, food profiles, one-off
 *              reasons. Everything else is translated by the app.
 * @param count how many items make up {@code value}, where that differs from it
 */
public record Part(String key, String label, long value, Long count) {}
