package com.khatiyan.d_modules.compliance.service;

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

    static List<AgreementClause> starterClauses() {
        return List.of(
            AgreementClause.system(SystemClauseType.LOCK_IN, "Minimum stay (lock-in)",
                "No minimum lock-in: either party may end the tenancy with the required notice.",
                Map.<String, Object>of("months", 0, "penaltyType", "REMAINING_TERM", "penaltyFixedPaise", 0), 0),
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
