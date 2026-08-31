package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.ClauseKind;
import com.khatiyan.d_modules.compliance.model.ClauseParagraph;
import com.khatiyan.d_modules.compliance.model.ClauseSegment;
import com.khatiyan.d_modules.compliance.model.CustomClauseSpec;
import com.khatiyan.d_modules.compliance.model.MainClauseType;
import com.khatiyan.d_modules.compliance.model.MiscClauseType;
import com.khatiyan.d_modules.compliance.model.SegmentStyle;

/**
 * Which clauses a deed carries, in what order, numbered how.
 *
 * <p>Pure functions throughout — no mocks. The assembler and the templates take
 * facts and return clauses, which is the whole reason the property lookups were
 * pushed out into {@link DeedFacts}.
 */
class AgreementAssemblerTest {

    private final AgreementAssembler assembler = new AgreementAssembler(new MainClauseTemplates());

    private static final LocalDate START = LocalDate.of(2026, 8, 29);

    @Test
    void anIndefiniteDeedCarriesTheWholeMainRun() {
        List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), indefinite());

        assertThat(clauses).allMatch(clause -> clause.getKind() == ClauseKind.MAIN);
        assertThat(clauses).extracting(AgreementClause::getMainType)
                .containsExactly(MainClauseType.values());
        assertThat(clauses).extracting(AgreementClause::getDisplayOrder)
                .containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);
    }

    /**
     * A clause with nothing to say is absent, and that is not an exclusion.
     *
     * <p>No deposit means the deposit-payment clause has no subject. It is dropped
     * by the facts, not by the owner, so it is never offered back to them.
     */
    @Test
    void theDepositPaymentClauseIsOmittedWhenNoDepositIsTaken() {
        DeedFacts noDeposit = facts(null, 0L, false);

        List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), noDeposit);

        assertThat(clauses).extracting(AgreementClause::getMainType)
                .doesNotContain(MainClauseType.DEPOSIT_PAYMENT)
                .contains(MainClauseType.SECURITY_DEPOSIT);
        assertThat(clauses).hasSize(MainClauseType.values().length - 1);
    }

    @Test
    void droppingAMainClauseClosesTheNumberingUp() {
        AgreementTemplate template = template(EnumSet.of(MainClauseType.INSPECTION), List.of(), List.of());

        List<AgreementClause> clauses = assembler.assemble(template, indefinite());

        assertThat(clauses).extracting(AgreementClause::getMainType)
                .doesNotContain(MainClauseType.INSPECTION);
        assertThat(clauses).hasSize(13);
        assertThat(clauses).extracting(AgreementClause::getDisplayOrder)
                .containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
    }

    @Test
    void aDroppedClauseIsOfferedBack() {
        AgreementTemplate template = template(
                EnumSet.of(MainClauseType.INSPECTION, MainClauseType.ALTERATION), List.of(), List.of());

        assertThat(template.availableMainClauses())
                .containsExactly(MainClauseType.ALTERATION, MainClauseType.INSPECTION);
    }

    @Test
    void aCustomClauseTakesThePositionItAsksFor() {
        AgreementTemplate template = template(
                EnumSet.noneOf(MainClauseType.class),
                List.of(),
                List.of(new CustomClauseSpec("Our deposit terms", "The deposit is held in escrow.", 4)));

        List<AgreementClause> clauses = assembler.assemble(template, indefinite());

        assertThat(clauses.get(3).getKind()).isEqualTo(ClauseKind.CUSTOM);
        assertThat(clauses.get(3).getHeading()).isEqualTo("Our deposit terms");
        assertThat(clauses.get(3).getDisplayOrder()).isEqualTo(4);
        // The clause it displaced moves down rather than being replaced.
        assertThat(clauses.get(4).getMainType()).isEqualTo(MainClauseType.SECURITY_DEPOSIT);
        assertThat(clauses.get(4).getDisplayOrder()).isEqualTo(5);
    }

    /** Two clauses asking for the same slot keep the order they were written in. */
    @Test
    void tiedPositionsKeepTheirStoredOrder() {
        AgreementTemplate template = template(
                EnumSet.noneOf(MainClauseType.class),
                List.of(),
                List.of(
                        new CustomClauseSpec("First", "one", 4),
                        new CustomClauseSpec("Second", "two", 4)));

        List<AgreementClause> clauses = assembler.assemble(template, indefinite());

        assertThat(clauses.get(3).getHeading()).isEqualTo("First");
        assertThat(clauses.get(4).getHeading()).isEqualTo("Second");
        assertThat(clauses.get(5).getMainType()).isEqualTo(MainClauseType.SECURITY_DEPOSIT);
    }

    /**
     * A custom clause written for a slot that no longer exists is not lost.
     *
     * <p>Dropping main clauses shortens the run, so a position past its end has to
     * land somewhere. The end of the main run is the only answer that keeps the
     * owner's words in the document.
     */
    @Test
    void aPositionPastTheEndClampsToTheEndOfTheMainRun() {
        AgreementTemplate template = template(
                EnumSet.noneOf(MainClauseType.class),
                List.of(),
                List.of(new CustomClauseSpec("Trailing", "text", 99)));

        List<AgreementClause> clauses = assembler.assemble(template, indefinite());

        AgreementClause last = clauses.get(clauses.size() - 1);
        assertThat(last.getHeading()).isEqualTo("Trailing");
        assertThat(last.getDisplayOrder()).isEqualTo(15);
    }

    @Test
    void miscellaneousClausesAreTheirOwnSectionNumberedFromOne() {
        AgreementTemplate template = template(
                EnumSet.noneOf(MainClauseType.class),
                List.of(MiscClauseType.PETS_NOT_PERMITTED, MiscClauseType.SECURITY_ILLEGAL_ACTIVITY),
                List.of());

        List<AgreementClause> clauses = assembler.assemble(template, indefinite());
        List<AgreementClause> misc = clauses.stream().filter(c -> c.getKind() == ClauseKind.MISC).toList();

        // They follow the whole main run...
        assertThat(clauses.subList(0, 14)).allMatch(c -> c.getKind() == ClauseKind.MAIN);
        // ...but restart their numbering rather than continuing at 15.
        assertThat(misc).extracting(AgreementClause::getDisplayOrder).containsExactly(1, 2);
        assertThat(misc).extracting(AgreementClause::getMiscType)
                .containsExactly(MiscClauseType.PETS_NOT_PERMITTED, MiscClauseType.SECURITY_ILLEGAL_ACTIVITY);
    }

    /**
     * No clause may name another by number.
     *
     * <p>Every main clause can be dropped, so "as agreed in Clause 2" is a
     * reference that can point at nothing — or, after renumbering, at a different
     * clause entirely.
     */
    @Test
    void noClauseReferencesAnotherByNumber() {
        for (DeedFacts shape : List.of(indefinite(), fixedTerm())) {
            List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), shape);

            assertThat(clauses).allSatisfy(clause ->
                    assertThat(bodyText(clause).toLowerCase()).doesNotContain("clause "));
        }
    }

    @Test
    void aFixedTermStatesItsEndDateRatherThanANoticePeriod() {
        List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), fixedTerm());

        AgreementClause cancellation = clauses.stream()
                .filter(c -> c.getMainType() == MainClauseType.CANCELLATION)
                .findFirst()
                .orElseThrow();

        assertThat(bodyText(cancellation)).contains("July 29, 2027").doesNotContain("1 month");
    }

    /**
     * An indefinite stay ends by NOTICE, and the clause says what skipping it costs.
     *
     * <p>The notice figure is restated here rather than left to the cancellation
     * clause. Any clause can be dropped, and the one term that costs a tenant
     * money must not become unreadable because a neighbour was removed.
     */
    @Test
    void anIndefiniteEarlyExitStatesTheNoticeAndTheConsequence() {
        DeedFacts facts = new DeedFacts(
                START, null, null, 12_000_00L, 10_000_00L, false, "", false, false, 5, 0L,
                "1 month", "One month's rent is forfeited from the deposit.",
                List.of(), List.of(), List.of(), false);

        String body = bodyText(clauseOf(assembler.assemble(AgreementTemplate.starter(), facts),
                MainClauseType.EARLY_EXIT));

        assertThat(body)
                .contains("runs indefinitely")
                .contains("serving 1 month of notice")
                .contains("Failure to serve that notice")
                .contains("One month's rent is forfeited from the deposit.");
    }

    /**
     * Clause 1 carries the LANDLORD's notice duty, and only that.
     *
     * <p>The tenant's notice obligation belongs to the early-exit clause, which is
     * also where its consequence is stated. Repeating it here left a reader
     * meeting the same duty twice and its penalty once.
     */
    @Test
    void thePeriodClauseStatesTheLandlordsNoticeNotTheTenants() {
        String indefinite = bodyText(clauseOf(assembler.assemble(AgreementTemplate.starter(), indefinite()),
                MainClauseType.PERIOD));

        assertThat(indefinite)
                .contains("runs indefinitely")
                .contains("Landlord shall provide advance notice of at least 1 month");
        assertThat(indefinite).doesNotContain("Tenant may end");

        String fixed = bodyText(clauseOf(assembler.assemble(AgreementTemplate.starter(), fixedTerm()),
                MainClauseType.PERIOD));

        assertThat(fixed)
                .contains("runs until July 29, 2027")
                .contains("for a term of 11 months")
                .contains("Landlord shall provide advance notice of at least 1 month");
    }

    /** A fixed term locks BOTH sides, and the landlord owes compensation for breaking it. */
    @Test
    void aFixedTermEarlyExitLocksBothSides() {
        String body = bodyText(clauseOf(assembler.assemble(AgreementTemplate.starter(), fixedTerm()),
                MainClauseType.EARLY_EXIT));

        assertThat(body)
                .contains("fixed term of 11 months")
                .contains("August 29, 2026")
                .contains("July 29, 2027")
                .contains("neither may the Landlord ask the Tenant to vacate")
                .contains("nor may the Tenant vacate the Premises of their own accord")
                .contains("Landlord shall compensate the Tenant");
    }

    /**
     * On a property's template every tenancy-supplied value is named, not blank.
     *
     * <p>And the owner's OWN policy still resolves — blanking the notice period on
     * the screen where it is configured would hide the thing being configured.
     */
    @Test
    void aTemplatePreviewNamesTheValuesOnboardingWillSupply() {
        List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), unresolved());

        AgreementClause rent = clauses.stream()
                .filter(c -> c.getMainType() == MainClauseType.RENT)
                .findFirst()
                .orElseThrow();
        assertThat(placeholders(rent)).containsExactly("Rent Amount");

        AgreementClause cancellation = clauses.stream()
                .filter(c -> c.getMainType() == MainClauseType.CANCELLATION)
                .findFirst()
                .orElseThrow();
        assertThat(placeholders(cancellation)).isEmpty();
        assertThat(bodyText(cancellation)).contains("1 month");

        // The deposit clause shows the shape a deposit will take rather than
        // declaring there is none, because on a template we do not yet know.
        assertThat(clauses).extracting(AgreementClause::getMainType)
                .contains(MainClauseType.DEPOSIT_PAYMENT);
    }

    /**
     * The TERM resolves on a template preview; the dates around it do not.
     *
     * <p>The term is set on the settings screen itself, so hiding it behind a
     * placeholder made an owner type "11" and watch the deed keep saying "Term" —
     * the one value on that page they had just supplied. The start and end dates
     * stay named, because they depend on a start nobody has chosen yet.
     */
    @Test
    void aTemplatePreviewResolvesTheTermButNotTheDates() {
        DeedFacts facts = new DeedFacts(
                START, 11, START.plusMonths(11), 0L, 0L, false, "", false, false, 5, 0L,
                "1 month", "", List.of(), List.of(), List.of(), true);

        List<AgreementClause> clauses = assembler.assemble(AgreementTemplate.starter(), facts);

        AgreementClause period = clauseOf(clauses, MainClauseType.PERIOD);
        assertThat(bodyText(period)).contains("for a term of 11 months");
        assertThat(placeholders(period)).contains("Start Date", "End Date").doesNotContain("Term");

        AgreementClause earlyExit = clauseOf(clauses, MainClauseType.EARLY_EXIT);
        assertThat(bodyText(earlyExit)).contains("fixed term of 11 months");
        assertThat(placeholders(earlyExit)).doesNotContain("Term");
    }

    // ---------------------------------------------------------------- setup

    private static AgreementClause clauseOf(List<AgreementClause> clauses, MainClauseType type) {
        return clauses.stream()
                .filter(clause -> clause.getMainType() == type)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No " + type + " clause in the deed"));
    }

    private static String bodyText(AgreementClause clause) {
        return clause.getBody().stream()
                .flatMap(paragraph -> paragraph.segments().stream())
                .map(ClauseSegment::text)
                .reduce("", (left, right) -> left + right);
    }

    private static List<String> placeholders(AgreementClause clause) {
        return clause.getBody().stream()
                .flatMap(paragraph -> paragraph.segments().stream())
                .filter(segment -> segment.style() == SegmentStyle.PLACEHOLDER)
                .map(ClauseSegment::text)
                .toList();
    }

    private static AgreementTemplate template(
            Set<MainClauseType> excluded, List<MiscClauseType> misc, List<CustomClauseSpec> custom) {
        return new AgreementTemplate(excluded, misc, custom, null, "");
    }

    private static DeedFacts indefinite() {
        return facts(null, 10_000_00L, false);
    }

    private static DeedFacts fixedTerm() {
        return facts(11, 10_000_00L, false);
    }

    private static DeedFacts unresolved() {
        return facts(null, 0L, true);
    }

    private static DeedFacts facts(Integer validityMonths, long depositPaise, boolean unresolved) {
        boolean fixed = validityMonths != null && validityMonths > 0;
        return new DeedFacts(
                START,
                fixed ? validityMonths : null,
                fixed ? START.plusMonths(validityMonths) : null,
                12_000_00L,
                depositPaise,
                false,
                "",
                false,
                false,
                5,
                100_00L,
                "1 month",
                "",
                List.of("Verified damage"),
                List.of("Return the keys"),
                List.of("Bedding"),
                unresolved);
    }
}
