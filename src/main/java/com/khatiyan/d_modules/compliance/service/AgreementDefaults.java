package com.khatiyan.d_modules.compliance.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.SystemClauseType;

/**
 * Builds the seeded "starter library" of clauses the compliance module OWNS for
 * a property with no agreement settings yet — the genuinely new rules + custom
 * prose. Property-derived rules are NOT seeded here: {@code RENT}, the
 * billing-policy rules (late fee, grace, notice, deposit) and the property exit
 * policies ({@code DAMAGE_CATALOG}, {@code EXIT_PREREQUISITES}) are all injected
 * at assembly time from their single source of truth, never duplicated.
 */
final class AgreementDefaults {

    private AgreementDefaults() {
    }

    /**
     * The validity clause's value.
     *
     * <p>{@code validityMonths} null means indefinite. {@code earlyExitRule} is
     * the owner's own words for what leaving before the term ends costs —
     * applied by a person at end-tenancy, never computed. A map is used because
     * clauses are stored as JSONB, which also means a missing key reads as null
     * rather than failing, so both are always written.
     */
    static Map<String, Object> agreementValidityValue(Integer validityMonths, String earlyExitRule) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("validityMonths", validityMonths);
        value.put("earlyExitRule", earlyExitRule == null ? "" : earlyExitRule);
        return value;
    }

    static List<AgreementClause> starterClauses() {
        return List.of(
            // Indefinite by default, which is the right shape for most PG stays:
            // the agreement ends when the tenant does. An owner who wants a fixed
            // term sets the months, and the tenancy then carries that end date
            // from day one.
            AgreementClause.system(SystemClauseType.VALIDITY, "Agreement validity",
                "This agreement runs until the tenancy ends. Either party may end it with the"
                    + " required notice.",
                agreementValidityValue(null, ""), 0),
            AgreementClause.system(SystemClauseType.ALLOWED_DEDUCTIONS, "Permitted deductions",
                "At move-out the deposit may be used only for verified damage, unpaid dues and cleaning.",
                Map.<String, Object>of("categories", List.of("DAMAGE", "UNPAID_DUES", "CLEANING")), 1),
            AgreementClause.custom("Liability",
                "The property is not responsible for loss of personal belongings left unattended in common areas.", 2),
            AgreementClause.custom("Guests & visitors",
                "Overnight guests must be intimated to the owner in advance.", 3),
            AgreementClause.custom("House rules",
                "Keep shared spaces clean and noise to a minimum after 10 PM.", 4)
        );
    }
}
