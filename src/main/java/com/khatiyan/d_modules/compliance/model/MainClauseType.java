package com.khatiyan.d_modules.compliance.model;

/**
 * The fourteen clauses of the deed, in the order they are numbered.
 *
 * <p><b>Declaration order is the running order of the document.</b> Nothing else
 * stores it — the assembler walks this enum, skips what the owner excluded and
 * what the tenancy makes vacuous, and numbers what is left. Reordering these
 * constants reorders every agreement issued afterwards.
 *
 * <p>Wording lives in {@code MainClauseTemplates}, not here: most of these
 * clauses have two or three variants keyed off the tenancy's shape, and a
 * constant carrying one string could only ever hold one of them.
 *
 * <p>Renewal is deliberately absent. It is the reference deed's clause 6, and it
 * needs a renewal workflow for fixed-term agreements before it can say anything
 * true; an indefinite agreement never renews at all. When it returns it takes a
 * position in this list and every later clause shifts down by one — which is
 * safe, because a signed agreement stores its own resolved numbering.
 */
public enum MainClauseType {
    PERIOD,
    RENT,
    /**
     * Rent payment — a WINDOW, not a calendar date.
     *
     * <p>The constant keeps its original name because it is persisted, but the
     * clause reads "a cycle begins on the Nth and rent is paid within N days of
     * that day". Billing runs on the tenancy's own anniversary with a grace
     * period, so there is no fixed date to promise.
     */
    RENT_DUE_DATE,
    SECURITY_DEPOSIT,
    DEPOSIT_PAYMENT,
    USAGE_DAMAGES_REPAIRS,
    NO_TENANCY,
    POSSESSION,
    ALTERATION,
    INSPECTION,
    CANCELLATION,
    EARLY_EXIT,
    OTHER_CHARGES,
    FURNITURE_APPLIANCES
}
