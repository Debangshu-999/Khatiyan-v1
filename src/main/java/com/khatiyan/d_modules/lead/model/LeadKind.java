package com.khatiyan.d_modules.lead.model;

/**
 * What a record is to the owner (user, 2026-10-11).
 *
 * <p>Never stored. It is read off the stage, whether the record is open, why
 * it closed, and whether a visit was ever scheduled on it. The same reading is
 * written once more in SQL, for the list's filter and the counts
 * ({@code LeadRepository.KIND}), and a test holds the two together.
 */
public enum LeadKind {

    /** Open, at Enquired. Not a lead yet. It lives on the Enquiries screen. */
    ENQUIRY,

    /** Open, with a visit scheduled. */
    EARLY_LEAD,

    /** Open, a visit attended. A booking request, its counters and a token that is due all sit here. */
    ADVANCED_LEAD,

    /** Open, a booking confirmed. */
    BOOKED,

    /** Moved in. The stay is active. */
    CONVERTED,

    /** Closed without a move-in, after a visit had been scheduled on it at least once. */
    DEAD,

    /** Closed without ever having a visit scheduled. Counted, never listed as a lead. */
    LOST_ENQUIRY;

    // Duplicate and potential spam are not kinds since 2026-10-17. They mark a record of any kind
    // (LeadRepeatFlag), which is worked like any other.

    /** A lead that is still going: early, advanced or booked. */
    public boolean isInPlay() {
        return this == EARLY_LEAD || this == ADVANCED_LEAD || this == BOOKED;
    }

    public static LeadKind of(Lead lead) {
        if (lead.isOpen()) {
            return switch (lead.getStage()) {
                case ENQUIRED -> ENQUIRY;
                case EARLY_LEAD -> EARLY_LEAD;
                case ADVANCED_LEAD -> ADVANCED_LEAD;
                // An open record is never at Moved in: moving in closes it.
                case BOOKED, MOVED_IN -> BOOKED;
            };
        }
        return switch (lead.getCloseReason()) {
            case CONVERTED -> CONVERTED;
            default -> lead.wasEverALead() ? DEAD : LOST_ENQUIRY;
        };
    }
}
