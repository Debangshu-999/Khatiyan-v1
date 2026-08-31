package com.khatiyan.d_modules.compliance.model;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The owner's choices about a deed, as opposed to the deed itself.
 *
 * <p>Stored twice on purpose: once on the property as its default, and again on
 * each pending agreement. The copy on the agreement is what makes a pending deed
 * re-editable — an owner dropping a clause at onboarding changes the template,
 * the assembler runs again, and the rendered clauses are replaced. Without it,
 * editing one tenancy's agreement would mean re-deriving from the property and
 * losing whatever was varied for this stay.
 *
 * <p>Once accepted, the template stops mattering: the frozen clause list is the
 * agreement, and the template beside it is only a record of how it was built.
 *
 * <h2>Why exclusions rather than inclusions</h2>
 *
 * <p>{@code excludedMainClauses} names what is OFF. Storing what is ON would mean
 * a main clause added in a later release is silently missing from every property
 * configured before it existed — the owner would never know a term had appeared
 * that their deed does not carry. Recording the opt-outs makes a new clause
 * default to present, which is the safe direction for a legal document.
 */
public record AgreementTemplate(
        Set<MainClauseType> excludedMainClauses,
        List<MiscClauseType> miscClauses,
        List<CustomClauseSpec> customClauses,

        /**
         * The term new tenancies start from. Null means indefinite.
         *
         * <p>Lives on the template because the settings screen has to know which
         * shape to render: the period and cancellation clauses read completely
         * differently for a fixed term, and a preview that guessed would show the
         * owner a deed they will never issue. Onboarding may still override it for
         * one stay.
         */
        Integer defaultValidityMonths,

        /** What leaving a fixed term early costs, in the owner's words. */
        String defaultEarlyExitRule) {

    /**
     * The whole main run, nothing ticked, nothing written.
     *
     * <p>A complete and valid deed on its own, which is why no sample prose is
     * seeded. The old starter library shipped three specimen custom clauses about
     * liability, guests and noise; with a curated library to tick from, seeding an
     * owner's own clause list with words we wrote just invites them to be signed
     * unread.
     */
    public static AgreementTemplate starter() {
        // Indefinite by default, which is the right shape for most PG stays: the
        // agreement ends when the tenant does.
        return new AgreementTemplate(EnumSet.noneOf(MainClauseType.class), List.of(), List.of(), null, "");
    }

    /** Normalised and defensively copied — JSONB can hand back nulls for absent keys. */
    public AgreementTemplate {
        // Built by addAll rather than EnumSet.copyOf, which throws on an empty
        // collection — and empty is the common case, since most owners exclude
        // nothing.
        Set<MainClauseType> excluded = EnumSet.noneOf(MainClauseType.class);
        if (excludedMainClauses != null) {
            excluded.addAll(excludedMainClauses);
        }
        excludedMainClauses = excluded;
        // Ticked order is the printed order, so duplicates are dropped while
        // keeping the first occurrence rather than sorted away.
        miscClauses = miscClauses == null
                ? List.of()
                : List.copyOf(new LinkedHashSet<>(miscClauses));
        customClauses = customClauses == null ? List.of() : List.copyOf(customClauses);
    }

    public boolean includes(MainClauseType type) {
        return !excludedMainClauses.contains(type);
    }

    /** The main clauses an owner has dropped and can put back. */
    public List<MainClauseType> availableMainClauses() {
        List<MainClauseType> available = new ArrayList<>();
        for (MainClauseType type : MainClauseType.values()) {
            if (excludedMainClauses.contains(type)) {
                available.add(type);
            }
        }
        return available;
    }
}
