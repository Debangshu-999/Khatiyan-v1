package com.khatiyan.d_modules.compliance.service;

import java.time.LocalDate;
import java.util.List;

/**
 * Everything the fourteen clauses need, and nothing about where it came from.
 *
 * <p>Flattened to plain types on purpose: the templates that render the deed's
 * prose have no business importing a property DTO, and a facts record makes each
 * clause variant testable by handing it two booleans rather than assembling a
 * property. {@link AgreementAssembler} is the only thing that builds one, from
 * the tenancy, the property and its policies.
 *
 * @param startDate       the tenancy's first day
 * @param validityMonths  fixed term in months, or null for an indefinite agreement
 * @param agreementEndDate the term's last day; null when indefinite
 * @param dailyBilling    a per-day stay, which has no monthly due date
 * @param earlyExitRule   the owner's words for leaving before a fixed term ends; may be blank
 * @param prematureExitPolicy the owner's words for leaving an indefinite stay without notice; may be blank
 * @param noticePeriodLabel the notice period's own label — "1 month", not "30 days"
 * @param permittedDeductions what the deposit may be used for, as printable labels
 * @param exitChecklist   what must be done before the deposit is settled
 * @param furnishings     the room's amenities and custom amenities, as printable labels
 */
public record DeedFacts(
        LocalDate startDate,
        Integer validityMonths,
        LocalDate agreementEndDate,
        long rentAmountPaise,
        long depositAmountPaise,
        boolean dailyBilling,
        String earlyExitRule,
        boolean foodIncluded,
        boolean electricityIncluded,
        int rentGraceDays,
        long rentLateFeePerDayPaise,
        String noticePeriodLabel,
        String prematureExitPolicy,
        List<String> permittedDeductions,
        List<String> exitChecklist,
        List<String> furnishings,

        /**
         * True when no tenant exists yet, so the tenancy-supplied facts render as
         * named blanks instead of values.
         *
         * <p>Only the TENANCY half goes blank — rent, deposit, dates, the room's
         * fittings. The property's own policy is known perfectly well on the
         * settings screen, and blanking the notice period or the deduction list
         * there would hide from an owner the very thing they are configuring.
         */
        boolean unresolved) {

    /**
     * Whether this is a fixed term.
     *
     * <p>The single condition the deed turns on more than any other: it decides
     * the period clause, the cancellation clause and which of the two early-exit
     * rules applies.
     */
    public boolean isFixedTerm() {
        return validityMonths != null && validityMonths > 0 && agreementEndDate != null;
    }

    public boolean hasDeposit() {
        return depositAmountPaise > 0;
    }
}
