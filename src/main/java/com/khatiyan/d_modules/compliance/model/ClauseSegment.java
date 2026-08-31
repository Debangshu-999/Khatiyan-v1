package com.khatiyan.d_modules.compliance.model;

/**
 * A run of text inside a clause paragraph.
 *
 * <p>{@code VALUE} exists so a reader can find the figures that concern them —
 * the rent, the dates, the deposit, the term — in a wall of legal prose.
 * {@code PLACEHOLDER} carries the NAME of the value instead, for the property's
 * own template, where those figures do not exist yet.
 *
 * <p>Style is carried as a flag rather than as markup in the string so the
 * renderer decides how to show it, and so a stored clause holds text a person can
 * read rather than text with syntax in it.
 *
 * <p>Deliberately framework-free. These are serialised into the agreement's
 * JSONB and are the shape a future published library would read.
 */
public record ClauseSegment(String text, SegmentStyle style) {

    public static ClauseSegment plain(String text) {
        return new ClauseSegment(text, SegmentStyle.PLAIN);
    }

    /** A resolved fact — rendered semibold. */
    public static ClauseSegment marked(String text) {
        return new ClauseSegment(text, SegmentStyle.VALUE);
    }

    /**
     * The name of a value onboarding will supply — rendered semibold and
     * underlined, reading "Rent Day" or "Execution Date" in the sentence itself.
     */
    public static ClauseSegment placeholder(String label) {
        return new ClauseSegment(label, SegmentStyle.PLACEHOLDER);
    }
}
