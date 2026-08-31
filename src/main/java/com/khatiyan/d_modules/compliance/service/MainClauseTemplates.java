package com.khatiyan.d_modules.compliance.service;

import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.ClauseParagraph;
import com.khatiyan.d_modules.compliance.model.ClauseSegment;
import com.khatiyan.d_modules.compliance.model.MainClauseType;

/**
 * The words of the fourteen main clauses.
 *
 * <p>Fixed in code and editable by nobody. An owner who wants different wording
 * drops the clause and writes their own in its position — which is why none of
 * these is protected, and why this class never takes an override.
 *
 * <p><b>No clause may name another by number.</b> Any of the fourteen can be
 * dropped, so "as agreed in Clause 2" is a reference that can point at nothing,
 * or worse, at a different clause after renumbering. Where the reference deed
 * cross-references, this restates the fact or omits it.
 *
 * <p>Returns an empty Optional for a clause with nothing to say — the
 * deposit-payment clause when no deposit is taken. That is different from a
 * clause the owner excluded: vacancy is decided here, from the facts, and the
 * owner is never offered it back because there is nothing to restore.
 */
@Component
public class MainClauseTemplates {

    private static final DateTimeFormatter LONG_DATE = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH);

    public Optional<AgreementClause> render(MainClauseType type, DeedFacts facts, int displayOrder) {
        return switch (type) {
            case PERIOD -> Optional.of(period(facts, displayOrder));
            case RENT -> Optional.of(rent(facts, displayOrder));
            case RENT_DUE_DATE -> Optional.of(rentDueDate(facts, displayOrder));
            case SECURITY_DEPOSIT -> Optional.of(securityDeposit(facts, displayOrder));
            case DEPOSIT_PAYMENT -> depositPayment(facts, displayOrder);
            case USAGE_DAMAGES_REPAIRS -> Optional.of(usage(displayOrder));
            case NO_TENANCY -> Optional.of(noTenancy(displayOrder));
            case POSSESSION -> Optional.of(possession(facts, displayOrder));
            case ALTERATION -> Optional.of(alteration(displayOrder));
            case INSPECTION -> Optional.of(inspection(displayOrder));
            case CANCELLATION -> Optional.of(cancellation(facts, displayOrder));
            case EARLY_EXIT -> Optional.of(earlyExit(facts, displayOrder));
            case OTHER_CHARGES -> Optional.of(otherCharges(facts, displayOrder));
            case FURNITURE_APPLIANCES -> Optional.of(furniture(facts, displayOrder));
        };
    }

    // ------------------------------------------------------------------ 1

    /**
     * The term, and the LANDLORD's notice obligation.
     *
     * <p>The tenant's notice obligation is deliberately absent, and lives only in
     * the early-exit clause — with the consequence of failing to serve it. Stating
     * it in both places meant a reader met the same duty twice and its penalty
     * once, which reads as two different rules rather than one.
     */
    private AgreementClause period(DeedFacts facts, int order) {
        List<ClauseSegment> grant = new ArrayList<>();
        grant.add(ClauseSegment.plain("That the Landlord hereby grants to the Tenant the right to occupy the"
                + " Premises without creating any tenancy rights or any other rights, title and interest in"
                + " favour of the Tenant with effect from "));
        grant.add(field(facts, "Start Date", () -> date(facts.startDate())));
        grant.add(ClauseSegment.plain("."));

        List<ClauseSegment> term = new ArrayList<>();
        if (facts.isFixedTerm()) {
            term.add(ClauseSegment.plain("This agreement runs until "));
            term.add(field(facts, "End Date", () -> date(facts.agreementEndDate())));
            term.add(ClauseSegment.plain(", for a term of "));
            term.add(ClauseSegment.marked(months(facts.validityMonths())));
            term.add(ClauseSegment.plain("."));
        } else {
            term.add(ClauseSegment.plain("This agreement runs indefinitely."));
        }

        List<ClauseSegment> landlordNotice = new ArrayList<>();
        landlordNotice.add(ClauseSegment.plain("The Landlord shall provide advance notice of at least "));
        landlordNotice.add(ClauseSegment.marked(facts.noticePeriodLabel()));
        landlordNotice.add(ClauseSegment.plain(" to end the tenancy."));

        return AgreementClause.main(MainClauseType.PERIOD, "Period",
                List.of(
                        new ClauseParagraph(false, grant),
                        new ClauseParagraph(false, term),
                        new ClauseParagraph(false, landlordNotice)),
                order);
    }

    // ------------------------------------------------------------------ 2

    private AgreementClause rent(DeedFacts facts, int order) {
        return AgreementClause.main(MainClauseType.RENT, "Rent",
                List.of(ClauseParagraph.of(
                        ClauseSegment.plain("That the Tenant shall pay to the Landlord the amount of "),
                        field(facts, "Rent Amount", () -> rupees(facts.rentAmountPaise())),
                        ClauseSegment.plain(" per month " + inclusionPhrase(facts)
                                + " towards the compensation for the use of the said Premises."))),
                order);
    }

    /**
     * What the rent covers, said plainly.
     *
     * <p>The reference deed says "including maintenance", a concept a PG does not
     * have — the two things a tenant actually asks about are food and electricity,
     * and the property already records both.
     */
    private String inclusionPhrase(DeedFacts facts) {
        if (facts.foodIncluded() && facts.electricityIncluded()) {
            return "including food and electricity charges";
        }
        if (facts.foodIncluded()) {
            return "including food charges but excluding electricity charges";
        }
        if (facts.electricityIncluded()) {
            return "including electricity charges but excluding food charges";
        }
        return "excluding food and electricity charges";
    }

    // ------------------------------------------------------------------ 3

    private AgreementClause rentDueDate(DeedFacts facts, int order) {
        List<ClauseParagraph> body = new ArrayList<>();

        if (facts.dailyBilling()) {
            body.add(ClauseParagraph.text("Rent is payable in advance for each day of stay."));
        } else if (facts.rentGraceDays() > 0) {
            body.add(ClauseParagraph.of(
                    ClauseSegment.plain("Rent is payable for each billing cycle in advance. A cycle for this"
                            + " tenancy begins on the "),
                    field(facts, "Cycle Day", () -> ordinal(facts.startDate().getDayOfMonth())),
                    ClauseSegment.plain(" day of each month, and the rent for that cycle shall be paid within "),
                    ClauseSegment.marked(days(facts.rentGraceDays())),
                    ClauseSegment.plain(" of that day.")));
        } else {
            body.add(ClauseParagraph.of(
                    ClauseSegment.plain("Rent is payable for each billing cycle in advance. A cycle for this"
                            + " tenancy begins on the "),
                    field(facts, "Cycle Day", () -> ordinal(facts.startDate().getDayOfMonth())),
                    ClauseSegment.plain(" day of each month, and the rent for that cycle is payable on that day.")));
        }

        // Omitted rather than negated. A deed does not need to announce a charge
        // that does not exist, and "no late fee is charged" invites the reader to
        // wonder what else is not being charged.
        if (facts.rentLateFeePerDayPaise() > 0) {
            body.add(ClauseParagraph.of(
                    ClauseSegment.plain("Rent unpaid after that period attracts a late fee of "),
                    ClauseSegment.marked(rupees(facts.rentLateFeePerDayPaise())),
                    ClauseSegment.plain(" per day.")));
        }

        return AgreementClause.main(MainClauseType.RENT_DUE_DATE, "Rent payment", body, order);
    }

    // ------------------------------------------------------------------ 4

    private AgreementClause securityDeposit(DeedFacts facts, int order) {
        // On a property's template the deposit is unknown, so the clause shows the
        // shape a deposit WILL take rather than declaring there is none. Falling
        // through to the no-deposit wording would tell an owner their deed says
        // something it will not say for a single actual tenant.
        if (!facts.unresolved() && !facts.hasDeposit()) {
            return AgreementClause.main(MainClauseType.SECURITY_DEPOSIT, "Security deposit",
                    List.of(ClauseParagraph.text("No security deposit is collected for this stay.")), order);
        }

        List<ClauseParagraph> body = new ArrayList<>();
        boolean hasDeductions = !facts.permittedDeductions().isEmpty();

        body.add(ClauseParagraph.of(
                ClauseSegment.plain("The Tenant has paid / shall pay to the Landlord "),
                field(facts, "Deposit Amount", () -> rupees(facts.depositAmountPaise())),
                ClauseSegment.plain(" as an interest free refundable deposit for the use of the said Premises."
                        + " This amount shall be refunded by the Landlord to the Tenant at the time of vacating"
                        + " the said Premises"
                        + (hasDeductions ? ", after deducting:" : ", after deducting any amounts lawfully due."))));

        facts.permittedDeductions().forEach(entry -> body.add(ClauseParagraph.bullet(entry)));

        return AgreementClause.main(MainClauseType.SECURITY_DEPOSIT, "Security deposit", body, order);
    }

    // ------------------------------------------------------------------ 5

    private Optional<AgreementClause> depositPayment(DeedFacts facts, int order) {
        // Vacuous only once we KNOW there is no deposit. On a template we do not.
        if (!facts.unresolved() && !facts.hasDeposit()) {
            return Optional.empty();
        }
        return Optional.of(AgreementClause.main(MainClauseType.DEPOSIT_PAYMENT, "Deposit payment",
                List.of(ClauseParagraph.text("The Tenant has paid / shall pay the above mentioned deposit by the"
                        + " payment modes available.")),
                order));
    }

    // ------------------------------------------------------------------ 6

    private AgreementClause usage(int order) {
        return AgreementClause.main(MainClauseType.USAGE_DAMAGES_REPAIRS, "Usage, damages and repairs",
                List.of(ClauseParagraph.text("The Tenant shall use the said Premises for residential purpose only."
                        + " The Tenant shall maintain the said Premises in its existing condition. Any damage"
                        + " caused to the said Premises shall be repaired by the Tenant at their own cost subject"
                        + " to normal wear and tear. The Tenant shall not engage in any activity that is likely to"
                        + " cause nuisance to the other occupants of the Premises or to the neighbourhood; that is"
                        + " to the prejudice in any manner to the rights of the Landlord in respect of the said"
                        + " Premises; or that is unlawful or prohibited by State or Central Government. Further,"
                        + " the Tenant agrees to abide by all the house rules of the Premises.")),
                order);
    }

    // ------------------------------------------------------------------ 7

    private AgreementClause noTenancy(int order) {
        return AgreementClause.main(MainClauseType.NO_TENANCY, "No tenancy",
                List.of(ClauseParagraph.text("That the Tenant shall not claim any tenancy right and shall not have"
                        + " any right to transfer, assign, and sublet or grant any license or sub-license in"
                        + " respect of the Premises or any part thereof and also shall not mortgage or raise any"
                        + " loan against the said Premises.")),
                order);
    }

    // ------------------------------------------------------------------ 8

    private AgreementClause possession(DeedFacts facts, int order) {
        List<ClauseParagraph> body = new ArrayList<>();
        body.add(ClauseParagraph.text("That the Tenant on the expiration or termination or cancellation of this"
                + " agreement shall vacate the said Premises without delay with all their goods and belongings."
                + " In the event of the Tenant failing to remove themselves and / or their articles from the said"
                + " Premises on expiry of this agreement or sooner, the Landlord shall be entitled to recover"
                + " damages at the rate of double the amount of compensation per day; or alternatively the"
                + " Landlord shall be entitled to remove the Tenant and their belongings from the Premises,"
                + " without recourse to the court of law."));

        if (!facts.exitChecklist().isEmpty()) {
            body.add(ClauseParagraph.text("Before the deposit is settled, the Tenant shall:"));
            facts.exitChecklist().forEach(entry -> body.add(ClauseParagraph.bullet(entry)));
        }

        return AgreementClause.main(MainClauseType.POSSESSION, "Possession", body, order);
    }

    // ------------------------------------------------------------------ 9

    private AgreementClause alteration(int order) {
        return AgreementClause.main(MainClauseType.ALTERATION, "Alteration",
                List.of(ClauseParagraph.text("That the Tenant shall not make any alteration or addition to the"
                        + " construction or arrangements (internal or external) to the said Premises without prior"
                        + " written consent from the Landlord.")),
                order);
    }

    // ----------------------------------------------------------------- 10

    private AgreementClause inspection(int order) {
        return AgreementClause.main(MainClauseType.INSPECTION, "Inspection",
                List.of(ClauseParagraph.text("That the Landlord shall have a right of access either by themselves"
                        + " or through an authorized representative to enter, view and inspect the Premises at"
                        + " reasonable intervals, during reasonable hours with prior notice.")),
                order);
    }

    // ----------------------------------------------------------------- 11

    /**
     * Cancellation, which has to be honest about notice.
     *
     * <p>The system ignores notice on a fixed term — its last day was agreed on day
     * one. Printing a notice figure there would have the deed promise something the
     * behaviour contradicts, in the one document meant to record what both sides
     * actually agreed.
     */
    private AgreementClause cancellation(DeedFacts facts, int order) {
        // The shared middle of both variants, written without a leading capital so
        // each branch can supply its own opening rather than patch the case of a
        // sentence it did not write.
        String breach = "the Tenant commits default in regular and punctual payments of monthly compensation as"
                + " herein before mentioned; or commits breach of any of the terms, covenants and conditions of"
                + " this agreement, the Landlord shall be entitled to revoke and / or cancel the agreement hereby"
                + " granted";

        if (facts.isFixedTerm()) {
            return AgreementClause.main(MainClauseType.CANCELLATION, "Cancellation",
                    List.of(ClauseParagraph.of(
                            ClauseSegment.plain("That this agreement ends on "),
                            field(facts, "End Date", () -> date(facts.agreementEndDate())),
                            ClauseSegment.plain(" without further notice. If " + breach
                                    + " with immediate effect."))),
                    order);
        }

        return AgreementClause.main(MainClauseType.CANCELLATION, "Cancellation",
                List.of(ClauseParagraph.of(
                        ClauseSegment.plain("That if " + breach + ", by giving notice in writing of "),
                        ClauseSegment.marked(facts.noticePeriodLabel()),
                        ClauseSegment.plain(". The Tenant too shall have the right to vacate the said Premises by"
                                + " giving a notice in writing of "),
                        ClauseSegment.marked(facts.noticePeriodLabel()),
                        ClauseSegment.plain(" to the Landlord."))),
                order);
    }

    // ----------------------------------------------------------------- 12

    /**
     * Leaving early — the clause that says what it COSTS.
     *
     * <p>Both shapes state the obligation in full rather than pointing at the
     * cancellation clause for the notice figure. That is not redundancy: any
     * clause can be dropped, and the one term that costs a tenant money must not
     * become unreadable because a neighbouring clause was removed.
     *
     * <p>The owner's rule is always its own sentence, never spliced mid-clause.
     * It is free text — an owner may write "one month's rent is forfeited" or
     * "pay one month's rent" — and a template that grafted either onto "they
     * shall …" would produce a broken sentence for one of them.
     */
    private AgreementClause earlyExit(DeedFacts facts, int order) {
        List<ClauseParagraph> body = new ArrayList<>();

        if (facts.isFixedTerm()) {
            body.add(ClauseParagraph.of(
                    ClauseSegment.plain("This agreement has a fixed term of "),
                    ClauseSegment.marked(months(facts.validityMonths())),
                    ClauseSegment.plain(" and runs from "),
                    field(facts, "Start Date", () -> date(facts.startDate())),
                    ClauseSegment.plain(" until "),
                    field(facts, "End Date", () -> date(facts.agreementEndDate())),
                    ClauseSegment.plain(", during which neither may the Landlord ask the Tenant to vacate the"
                            + " Premises, nor may the Tenant vacate the Premises of their own accord.")));

            String rule = trimmed(facts.earlyExitRule());
            // An em dash, not a colon. The owner's rule is a whole sentence of
            // their own; a colon presents it as a list item continuing ours,
            // which reads wrong the moment they write more than a phrase.
            body.add(rule.isEmpty()
                    ? ClauseParagraph.text("However, should the Tenant vacate the Premises before the end of the"
                            + " term, no additional charge applies.")
                    : ClauseParagraph.text("However, should the Tenant vacate the Premises before the end of the"
                            + " term, the following applies — " + rule));

            body.add(ClauseParagraph.text("On the other hand, the Landlord shall compensate the Tenant for any"
                    + " loss and inconvenience caused, if the Tenant has been asked to vacate the Premises by the"
                    + " Landlord for any reason before the end of the term."));

            return AgreementClause.main(MainClauseType.EARLY_EXIT, "Early exit", body, order);
        }

        body.add(ClauseParagraph.of(
                ClauseSegment.plain("This agreement runs indefinitely. The Tenant may end it by serving "),
                ClauseSegment.marked(facts.noticePeriodLabel()),
                ClauseSegment.plain(" of notice to the Landlord.")));

        String policy = trimmed(facts.prematureExitPolicy());
        body.add(policy.isEmpty()
                ? ClauseParagraph.text("Failure to serve that notice, for any reason, does not attract an"
                        + " additional charge.")
                : ClauseParagraph.text("Failure to serve that notice, for any reason, will result in the"
                        + " following — " + policy));

        return AgreementClause.main(MainClauseType.EARLY_EXIT, "Early exit", body, order);
    }

    // ----------------------------------------------------------------- 13

    private AgreementClause otherCharges(DeedFacts facts, int order) {
        List<ClauseParagraph> body = new ArrayList<>();
        body.add(ClauseParagraph.text("That all statutory rates, taxes, levies, assessment etc. in respect of the"
                + " said Premises shall be paid by the Landlord."));
        body.add(ClauseParagraph.text(facts.electricityIncluded()
                ? "Electricity charges are included in the rent."
                : "The Tenant shall be responsible for the electricity charges consumed, billed separately from"
                        + " the rent."));
        return AgreementClause.main(MainClauseType.OTHER_CHARGES, "Other charges", body, order);
    }

    // ----------------------------------------------------------------- 14

    private AgreementClause furniture(DeedFacts facts, int order) {
        // The room is chosen at onboarding, so a template names the schedule
        // rather than claiming the Premises is unfurnished.
        if (facts.unresolved()) {
            return AgreementClause.main(MainClauseType.FURNITURE_APPLIANCES, "Furniture and appliances",
                    List.of(ClauseParagraph.of(
                            ClauseSegment.plain("The said Premises is provided with the furniture and appliances"
                                    + " of the room allotted: "),
                            ClauseSegment.placeholder("Room Furnishings"),
                            ClauseSegment.plain(". The Tenant shall maintain the same in their existing condition."
                                    + " Any damage caused to the said furniture and appliances shall be repaired by"
                                    + " the Tenant at their own cost, subject to normal wear and tear."))),
                    order);
        }

        if (facts.furnishings().isEmpty()) {
            return AgreementClause.main(MainClauseType.FURNITURE_APPLIANCES, "Furniture and appliances",
                    List.of(ClauseParagraph.text("The said Premises is provided unfurnished.")), order);
        }

        List<ClauseParagraph> body = new ArrayList<>();
        body.add(ClauseParagraph.text("The said Premises is provided with the furniture and appliances listed"
                + " below. The Tenant shall maintain the same in their existing condition. Any damage caused to"
                + " the said furniture and appliances shall be repaired by the Tenant at their own cost, subject"
                + " to normal wear and tear."));
        facts.furnishings().forEach(entry -> body.add(ClauseParagraph.bullet(entry)));

        return AgreementClause.main(MainClauseType.FURNITURE_APPLIANCES, "Furniture and appliances", body, order);
    }

    // ------------------------------------------------------------ helpers

    /**
     * The resolved value, or the name of the value onboarding will supply.
     *
     * <p>Lazy on purpose: on a property's template the end date is null and the
     * room does not exist, so computing the resolved string eagerly would throw on
     * exactly the previews that need the placeholder.
     *
     * <p>NOT used for the term length. That is set on the settings screen itself,
     * so putting it behind this helper made an owner type "11" and watch the deed
     * keep saying "Term" — the one value on the page they had just supplied.
     * Everything else this guards genuinely arrives at onboarding.
     */
    private static ClauseSegment field(DeedFacts facts, String label, Supplier<String> resolved) {
        return facts.unresolved() ? ClauseSegment.placeholder(label) : ClauseSegment.marked(resolved.get());
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    private static String months(int count) {
        return count + (count == 1 ? " month" : " months");
    }

    private static String days(int count) {
        return count + (count == 1 ? " day" : " days");
    }

    private static String date(LocalDate date) {
        return date.format(LONG_DATE);
    }

    private static String rupees(long paise) {
        return "₹" + NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN")).format(paise / 100);
    }

    /**
     * "1st", "2nd", "23rd", "11th".
     *
     * <p>The teens are the exception every naive implementation gets wrong: 11, 12
     * and 13 end in 1, 2 and 3 but take "th".
     */
    private static String ordinal(int day) {
        if (day >= 11 && day <= 13) {
            return day + "th";
        }
        return switch (day % 10) {
            case 1 -> day + "st";
            case 2 -> day + "nd";
            case 3 -> day + "rd";
            default -> day + "th";
        };
    }
}
