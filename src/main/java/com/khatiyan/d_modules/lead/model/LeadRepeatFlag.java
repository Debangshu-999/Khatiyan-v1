package com.khatiyan.d_modules.lead.model;

/**
 * A record opened by someone who walked away from earlier ones here (user,
 * 2026-10-17).
 *
 * <p>Marked by a rule, never by a person. When a new record opens, the
 * person's earlier records at this property that ended for their own reason,
 * since they last moved in here, are counted ({@link Lead#isEndedByProspect}).
 * One or two make the new one a duplicate. Three or more make it potential
 * spam. An earlier record the property let down (nobody responded, it
 * cancelled, it could not host) is not counted.
 *
 * <p>Never stored: read off the count kept on the record, which is fixed when
 * it opens. A marked record is still worked like any other. It is only left
 * out of the month's funnel, so the same person is not counted twice.
 */
public enum LeadRepeatFlag {

    /** One or two earlier records here ended for the person's own reason. */
    DUPLICATE,

    /** Three or more did. */
    POTENTIAL_SPAM;

    /** How many earlier walkaways make a record potential spam: the fourth record is. */
    public static final int POTENTIAL_SPAM_FROM = 3;

    /** The mark for a record that counted this many earlier walkaways. Null for none. */
    public static LeadRepeatFlag of(int earlierWalkaways) {
        if (earlierWalkaways >= POTENTIAL_SPAM_FROM) {
            return POTENTIAL_SPAM;
        }
        return earlierWalkaways > 0 ? DUPLICATE : null;
    }

    /** The fewest earlier walkaways a record with this mark has. */
    public int fewest() {
        return this == POTENTIAL_SPAM ? POTENTIAL_SPAM_FROM : 1;
    }

    /** The most earlier walkaways a record with this mark has. */
    public int most() {
        return this == POTENTIAL_SPAM ? Integer.MAX_VALUE : POTENTIAL_SPAM_FROM - 1;
    }

    /**
     * Why it is marked, in words for the owner (user, 2026-10-17: "has 3
     * expired leads from this user before, expired due to the user's non
     * interest").
     */
    public static String reasonFor(int earlierWalkaways) {
        return "Has " + earlierWalkaways + (earlierWalkaways == 1 ? " expired lead" : " expired leads")
                + " from this user before, expired due to the user's non interest.";
    }
}
