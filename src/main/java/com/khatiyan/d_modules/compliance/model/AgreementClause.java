package com.khatiyan.d_modules.compliance.model;

import java.util.ArrayList;
import java.util.List;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One resolved clause of an agreement, stored as JSON inside it.
 *
 * <p>Resolved, not templated: by the time a clause is here its slots are filled
 * and its words are final. A signed agreement therefore carries the text the
 * signatory actually read, which is the whole point of content-hashing it —
 * rendering from a template at read time would let a later reword silently change
 * what somebody agreed to.
 *
 * <p><b>There is no machine-readable {@code value}.</b> There used to be, for a
 * settlement engine that never read it. Every figure the system computes from
 * lives somewhere authoritative already — the term and early-exit rule on
 * {@code Tenancy}, the notice period, damage rates and checklist on
 * {@code Property} — and a second copy frozen inside a document is a copy that
 * can disagree with the one being enforced.
 *
 * <p>Deliberately framework-free (no Spring/JPA): this is the shape a future
 * pure-core settlement engine — and a potential published library — will read.
 */
@Getter
@Setter
@NoArgsConstructor
public class AgreementClause {

    private ClauseKind kind;

    /** Non-null only when {@link #kind} is {@code MAIN}. */
    private MainClauseType mainType;

    /** Non-null only when {@link #kind} is {@code MISC}. */
    private MiscClauseType miscType;

    private String heading;

    private List<ClauseParagraph> body = new ArrayList<>();

    /**
     * The clause's number WITHIN ITS SECTION, resolved once at assembly.
     *
     * <p>Not its position in the document. The main run (with custom clauses
     * spliced in) numbers 1..n, and the miscellaneous section starts again at 1
     * under its own heading. A reader groups by {@link #kind} and renders each
     * section's own sequence.
     */
    private int displayOrder;

    public static AgreementClause main(
            MainClauseType mainType, String heading, List<ClauseParagraph> body, int displayOrder) {
        AgreementClause clause = new AgreementClause();
        clause.kind = ClauseKind.MAIN;
        clause.mainType = mainType;
        clause.heading = heading;
        clause.body = copy(body);
        clause.displayOrder = displayOrder;
        return clause;
    }

    public static AgreementClause misc(MiscClauseType miscType, int displayOrder) {
        AgreementClause clause = new AgreementClause();
        clause.kind = ClauseKind.MISC;
        clause.miscType = miscType;
        clause.heading = miscType.heading();
        clause.body = List.of(ClauseParagraph.text(miscType.body()));
        clause.displayOrder = displayOrder;
        return clause;
    }

    /**
     * The owner's own prose, as a single unmarked paragraph.
     *
     * <p>No emphasis: emphasis marks values the system resolved, and everything
     * in a custom clause was typed by hand. Marking part of it would claim a
     * provenance the text does not have.
     */
    public static AgreementClause custom(String heading, String body, int displayOrder) {
        AgreementClause clause = new AgreementClause();
        clause.kind = ClauseKind.CUSTOM;
        clause.heading = heading;
        clause.body = List.of(ClauseParagraph.text(body));
        clause.displayOrder = displayOrder;
        return clause;
    }

    private static List<ClauseParagraph> copy(List<ClauseParagraph> body) {
        return body == null ? new ArrayList<>() : new ArrayList<>(body);
    }
}
