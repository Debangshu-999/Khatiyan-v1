package com.khatiyan.d_modules.compliance.model;

import java.util.LinkedHashMap;
import java.util.Map;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One clause in a tenancy agreement — either a machine-readable {@code SYSTEM}
 * rule (a typed value the settlement engine will read) or a free-text
 * {@code CUSTOM} prose clause. Stored as JSON inside the agreement.
 *
 * <p>Deliberately framework-free (no Spring/JPA): this is the shape the future
 * pure-core settlement engine — and a potential published library — will read.
 */
@Getter
@Setter
@NoArgsConstructor
public class AgreementClause {

    private ClauseKind kind;

    /** Non-null only for {@code SYSTEM} clauses. */
    private SystemClauseType systemType;

    /** Human title — a rendered label for {@code SYSTEM}, the owner's heading for {@code CUSTOM}. */
    private String heading;

    /** Human text — a rendered sentence for {@code SYSTEM}, the owner's prose for {@code CUSTOM}. */
    private String body;

    /** Structured value for {@code SYSTEM} clauses (e.g. {@code {"amountPaise":50000}}, {@code {"days":30}}); null for {@code CUSTOM}. */
    private Map<String, Object> value;

    private int displayOrder;

    public static AgreementClause system(SystemClauseType systemType, String heading, String body,
            Map<String, Object> value, int displayOrder) {
        AgreementClause clause = new AgreementClause();
        clause.kind = ClauseKind.SYSTEM;
        clause.systemType = systemType;
        clause.heading = heading;
        clause.body = body;
        clause.value = value == null ? null : new LinkedHashMap<>(value);
        clause.displayOrder = displayOrder;
        return clause;
    }

    public static AgreementClause custom(String heading, String body, int displayOrder) {
        AgreementClause clause = new AgreementClause();
        clause.kind = ClauseKind.CUSTOM;
        clause.heading = heading;
        clause.body = body;
        clause.displayOrder = displayOrder;
        return clause;
    }
}
