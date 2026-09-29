package com.khatiyan.d_modules.analytics.metric;

/**
 * One headline number.
 *
 * @param previous the same figure over the comparison window, or null when there
 *                 is no comparison or it had too few items to mean anything
 */
public record Figure(String key, Unit unit, long value, Long previous) {}
