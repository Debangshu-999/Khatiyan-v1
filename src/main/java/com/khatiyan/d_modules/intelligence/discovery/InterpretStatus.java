package com.khatiyan.d_modules.intelligence.discovery;

/**
 * How far an interpretation got.
 *
 * <p>Only {@link #READY} means "run this". Every other value carries a reason
 * to show. Filters are still returned alongside the location failures, because
 * "we could not find that place" is no reason to throw away the rest of what
 * the person said.
 */
public enum InterpretStatus {

    /** The filters can be run as they stand. */
    READY,

    /** The place text resolved to nothing. Filters are still returned. */
    LOCATION_NOT_FOUND,

    /** A "near me" search arrived without device coordinates. */
    LOCATION_NEEDED,

    /** The place resolved outside India, where nothing can match. */
    OUTSIDE_INDIA
}
