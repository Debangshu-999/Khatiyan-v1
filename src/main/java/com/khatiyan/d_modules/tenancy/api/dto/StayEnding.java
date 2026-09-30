package com.khatiyan.d_modules.tenancy.api.dto;

/**
 * The "Ends today" and "Ends soon" chips on a stay card, as a filter for the
 * owner's stay list (user, 2026-09-30).
 *
 * <p>They aren't statuses. Both come from the one checkout date, the same way
 * the card works them out, so a stay can be ACTIVE or ON_NOTICE and ending
 * soon at the same time.
 */
public enum StayEnding {
    /** The checkout date is today. */
    TODAY,
    /** The checkout is after today and inside the stay's ending-soon window (7, 15 or 30 days). */
    SOON
}
