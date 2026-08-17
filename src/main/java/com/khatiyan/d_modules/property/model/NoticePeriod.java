package com.khatiyan.d_modules.property.model;

/**
 * How much notice a tenant must give before leaving.
 *
 * <p><b>An enum, not a day count.</b> "One month from 15 Jan" is 15 Feb; "30 days
 * from 15 Jan" is 14 Feb. Storing 30 loses that distinction, and since a cycle is
 * a calendar month anchored on the tenant's move-in day, the day-count answer
 * lands one day off the cycle boundary — which then flips the generation gate and
 * creates a partial cycle nobody can price. Days are derived for display only.
 *
 * <p>An enum also removes every invalid value by construction: no zero, no 400,
 * no validation anyone can forget. Beyond three months is not a real policy, and
 * halves make the arithmetic ambiguous for no gain.
 *
 * <p>The split between sub-month and whole-month members is not cosmetic — they
 * are computed differently. See {@link #isWholeMonths()}.
 */
public enum NoticePeriod {

    FIVE_DAYS(5, 0, "5 days"),
    FIFTEEN_DAYS(15, 0, "15 days"),
    ONE_MONTH(0, 1, "1 month"),
    TWO_MONTHS(0, 2, "2 months"),
    THREE_MONTHS(0, 3, "3 months");

    private final int days;
    private final int months;
    private final String label;

    NoticePeriod(int days, int months, String label) {
        this.days = days;
        this.months = months;
        this.label = label;
    }

    /**
     * Whether this notice is counted in whole billing cycles rather than days.
     *
     * <p>Whole-month notices land on cycle boundaries by construction, so they
     * need no clamping and can never produce a partial cycle. Sub-month notices
     * are a minimum lead time inside the current cycle instead — the tenant has
     * already paid for the month and chooses how much of it to use.
     */
    public boolean isWholeMonths() {
        return months > 0;
    }

    /** Whole months of notice; zero for the sub-month options. */
    public int months() {
        return months;
    }

    /** Days of notice; zero for the whole-month options, which count in cycles. */
    public int days() {
        return days;
    }

    /**
     * How many <em>extra</em> cycles the notice runs past the current one.
     *
     * <p>One month is served by the cycle the request already sits in, because
     * requests may only be raised in the payment window at its start — so one
     * month adds nothing. Sub-month notices stay inside the current cycle too.
     */
    public int extraCyclesBeyondCurrent() {
        return months > 0 ? months - 1 : 0;
    }

    /** Human-readable form for agreements and tenant-facing copy. */
    public String label() {
        return label;
    }

    /**
     * Maps a legacy day count onto the closest member, for migrating the old
     * free-form integer column.
     */
    public static NoticePeriod fromLegacyDays(Integer legacyDays) {
        if (legacyDays == null) {
            return ONE_MONTH;
        }
        if (legacyDays <= 5) {
            return FIVE_DAYS;
        }
        if (legacyDays <= 15) {
            return FIFTEEN_DAYS;
        }
        if (legacyDays <= 31) {
            return ONE_MONTH;
        }
        if (legacyDays <= 62) {
            return TWO_MONTHS;
        }
        return THREE_MONTHS;
    }
}
