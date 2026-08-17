package com.khatiyan.d_modules.dashboard.api.dto;

/**
 * Which day group an activity item belongs to in the feed.
 *
 * <p>
 * There is deliberately no "older" bucket. The feed is a rolling 7-day window —
 * the query will not return anything older, and a purge job deletes those rows
 * outright — so every item that can reach a client falls into one of these.
 *
 * <p>
 * Computed server-side in IST: "today" is the owner's day, and the device
 * running the app is not necessarily in the same zone.
 */
public enum ActivityDayBucket {
    TODAY,
    YESTERDAY,
    /** Anything else still inside the 7-day window. */
    EARLIER_THIS_WEEK
}
