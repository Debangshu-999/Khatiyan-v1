package com.khatiyan.d_modules.discovery.api.dto;

/**
 * How a discovery search orders its listings.
 *
 * <p>Applied on the server because the list is paged: sorting on the device
 * would order only the pages already loaded, so a cheap room on page three
 * would sit below an expensive one on page one until somebody scrolled to it.
 *
 * <p>Every order applies WITHIN each section. Listings in the searched area
 * still come before the ones nearby — a sort changes the order inside the
 * answer, never what counts as the answer.
 */
public enum DiscoverySort {

    /** The default: best attribute match first, then nearest, then most relevant location. */
    RELEVANCE,

    /**
     * Nearest to the device first. Listings with no known distance go last,
     * rather than being treated as zero kilometres away.
     */
    DISTANCE,

    /** Cheapest starting rent first. Listings with no rent set ("on request") go last. */
    RENT_LOW,

    /** Highest starting rent first. Listings with no rent set still go last. */
    RENT_HIGH,

    /** Smallest deposit first. */
    DEPOSIT_LOW,

    /** Largest deposit first. */
    DEPOSIT_HIGH
}
