package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.property.model.NoticePeriod;

/**
 * The dates a tenant may choose to leave on.
 *
 * <p>Whole-month notice collapses this to a single date — the notice lands on a
 * cycle boundary by construction — so {@code earliestCheckoutDate} equals
 * {@code latestCheckoutDate} and {@code fixed} is true. Sub-month notice offers
 * a real range: five days' notice buys the right to leave in five days, it does
 * not oblige leaving on the fifth. The tenant has already paid for the month and
 * decides how much of it to use, which is what removes any need to prorate or
 * refund the unused tail.
 */
public record ExitCheckoutWindowResponse(
    NoticePeriod noticePeriod,
    /** The date the notice period counts from — the tenant's original request. */
    LocalDate noticeAnchorDate,
    /**
     * The soonest the tenant can leave having served their full notice. Choosing
     * this or later carries no early-exit consequence.
     */
    LocalDate earliestCheckoutDate,
    LocalDate latestCheckoutDate,
    /**
     * The floor for an <em>early</em> departure — tomorrow.
     *
     * <p>A tenant is allowed to leave before their notice is served; they simply
     * have not served it, which makes the request premature rather than
     * forbidden. Blocking it outright would leave anyone who has to move at short
     * notice with no route at all.
     */
    LocalDate earliestPossibleDate,
    /** True when there is only one possible date, so clients show text not a picker. */
    boolean fixed,
    /** True when this window belongs to a re-raise of a lapsed request. */
    boolean reRaise
) {
    public static ExitCheckoutWindowResponse of(
            NoticePeriod noticePeriod,
            LocalDate noticeAnchorDate,
            LocalDate earliest,
            LocalDate latest,
            LocalDate earliestPossible,
            boolean reRaise) {
        return new ExitCheckoutWindowResponse(
                noticePeriod,
                noticeAnchorDate,
                earliest,
                latest,
                earliestPossible,
                earliest.equals(latest),
                reRaise);
    }

    /** Whether leaving on this date would mean not having served the notice. */
    public boolean isPrematureOn(LocalDate checkoutDate) {
        return checkoutDate.isBefore(earliestCheckoutDate);
    }
}
