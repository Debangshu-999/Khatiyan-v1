package com.khatiyan.d_modules.compliance.service;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.ClauseKind;
import com.khatiyan.d_modules.compliance.model.SystemClauseType;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

/**
 * Composes the full per-tenancy clause list from its three sources of truth:
 *
 * <ol>
 *   <li><b>Tenancy</b> — {@code RENT} (room selection) and
 *       {@code SECURITY_DEPOSIT} (entered or property default at creation);</li>
 *   <li><b>Property policy</b> — {@code NOTICE_PERIOD}, {@code GRACE_DAYS},
 *       {@code LATE_FEE} (billing), plus {@code DAMAGE_CATALOG} and
 *       {@code EXIT_PREREQUISITES} (the property's exit policies), all owned by
 *       the property module;</li>
 *   <li><b>Compliance settings</b> — the property's default clause set
 *       (lock-in, permitted deductions) plus custom prose clauses.</li>
 * </ol>
 *
 * <p>System rules are never editable inside an agreement — uniformity comes
 * from deriving them here at assembly time instead of copying editable values.
 * Only custom prose clauses may vary per tenancy (via {@code customOverrides}).
 */
@Component
public class AgreementAssembler {

    // Clause types never taken from stored compliance settings: everything
    // derived here from property/tenancy state — the billing-policy rules, the
    // property exit policies (damage schedule + move-out checklist) — plus
    // CLEANING_FEE, which was dropped from authoring but old rows may still carry.
    private static final Set<SystemClauseType> EXCLUDED_SETTINGS_TYPES = EnumSet.of(
            SystemClauseType.RENT,
            SystemClauseType.SECURITY_DEPOSIT,
            SystemClauseType.NOTICE_PERIOD,
            SystemClauseType.GRACE_DAYS,
            SystemClauseType.LATE_FEE,
            SystemClauseType.DAMAGE_CATALOG,
            SystemClauseType.EXIT_PREREQUISITES,
            SystemClauseType.CLEANING_FEE);

    public List<AgreementClause> assemble(
            PropertyResponse property,
            PropertyBillingPolicyResponse billingPolicy,
            PropertyExitPolicyResponse exitPolicy,
            long rentAmountPaise,
            long depositAmountPaise,
            List<AgreementClause> propertyDefaultClauses,
            List<AgreementClause> customOverrides) {

        List<AgreementClause> clauses = new ArrayList<>();
        int order = 0;

        clauses.add(AgreementClause.system(SystemClauseType.RENT, "Monthly rent",
                "Monthly rent is " + rupees(rentAmountPaise) + ", payable each billing cycle.",
                Map.of("amountPaise", rentAmountPaise), order++));

        clauses.add(AgreementClause.system(SystemClauseType.SECURITY_DEPOSIT, "Security deposit",
                depositAmountPaise > 0
                        ? "A refundable security deposit of " + rupees(depositAmountPaise) + " is payable at the start of the tenancy."
                        : "No security deposit is collected for this tenancy.",
                Map.of("amountPaise", depositAmountPaise), order++));

        clauses.add(AgreementClause.system(SystemClauseType.NOTICE_PERIOD, "Notice period",
                "Either party may end this tenancy by giving " + property.noticePeriodDays() + " days' notice.",
                Map.of("days", property.noticePeriodDays()), order++));

        clauses.add(AgreementClause.system(SystemClauseType.GRACE_DAYS, "Rent grace period",
                "Rent carries a grace period of " + billingPolicy.rentGraceDays() + " days after the cycle due date.",
                Map.of("days", billingPolicy.rentGraceDays()), order++));

        long lateFeePerDayPaise = billingPolicy.rentLateFeePerDayPaise() != null
                ? billingPolicy.rentLateFeePerDayPaise()
                : 0L;
        clauses.add(AgreementClause.system(SystemClauseType.LATE_FEE, "Late fee",
                lateFeePerDayPaise > 0
                        ? "A late fee of " + rupees(lateFeePerDayPaise) + " per day applies to rent unpaid after the grace period."
                        : "No late fee is charged on delayed rent.",
                Map.of("perDayPaise", lateFeePerDayPaise), order++));

        // Property exit policies — the damage-charge schedule and move-out
        // checklist, owned by the property so every tenancy reads the same rates.
        List<Map<String, Object>> damageItems = damageItems(exitPolicy);
        clauses.add(AgreementClause.system(SystemClauseType.DAMAGE_CATALOG, "Damage charges",
                damageItems.isEmpty()
                        ? "No pre-agreed damage charges; any damage charge must be evidenced at move-out."
                        : "Damage beyond normal wear is charged per the property's damage schedule (" + damageItems.size()
                                + " item" + (damageItems.size() == 1 ? "" : "s") + ").",
                Map.of("items", damageItems), order++));

        List<String> checklist = exitPolicy != null && exitPolicy.exitChecklist() != null
                ? exitPolicy.exitChecklist()
                : List.of();
        clauses.add(AgreementClause.system(SystemClauseType.EXIT_PREREQUISITES, "Move-out checklist",
                checklist.isEmpty()
                        ? "No exit prerequisites are required before the deposit is settled."
                        : "Before the deposit is settled: " + String.join(", ", checklist) + ".",
                Map.of("checklist", checklist), order++));

        // Compliance-owned system rules — uniform per property, never per tenancy.
        for (AgreementClause clause : nonNull(propertyDefaultClauses)) {
            if (clause.getKind() == ClauseKind.SYSTEM && !EXCLUDED_SETTINGS_TYPES.contains(clause.getSystemType())) {
                clauses.add(AgreementClause.system(
                        clause.getSystemType(), clause.getHeading(), clause.getBody(), clause.getValue(), order++));
            }
        }

        // Custom prose — the per-tenancy override when given, else the property set.
        List<AgreementClause> customSource = customOverrides != null
                ? customOverrides
                : nonNull(propertyDefaultClauses).stream().filter(c -> c.getKind() == ClauseKind.CUSTOM).toList();
        for (AgreementClause clause : customSource) {
            clauses.add(AgreementClause.custom(clause.getHeading(), clause.getBody(), order++));
        }

        return clauses;
    }

    private static List<Map<String, Object>> damageItems(PropertyExitPolicyResponse exitPolicy) {
        if (exitPolicy == null || exitPolicy.damageCharges() == null) {
            return List.of();
        }
        return exitPolicy.damageCharges().stream()
                .map(charge -> Map.<String, Object>of("name", charge.name(), "chargePaise", charge.chargePaise()))
                .toList();
    }

    private static List<AgreementClause> nonNull(List<AgreementClause> clauses) {
        return clauses != null ? clauses : List.of();
    }

    private static String rupees(long paise) {
        return "₹" + NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN")).format(paise / 100);
    }
}
