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
 *       (validity, permitted deductions) plus custom prose clauses.</li>
 * </ol>
 *
 * <p>System rules are not editable inside an agreement — uniformity comes from
 * deriving them here at assembly time instead of copying editable values.
 *
 * <p>Two exceptions, both applied before assembly by
 * {@code TenancyAgreementService#withTenancyOverrides}: {@code VALIDITY} and
 * {@code ALLOWED_DEDUCTIONS} may be varied per tenancy at onboarding, because a
 * term and what a deposit covers are genuinely negotiated per tenant. Those
 * arrive here already folded into a COPY of the property's defaults, so this
 * class still sees one clause set and the stored property template is never
 * touched. Everything else stays uniform across the property.
 *
 * <p>Custom prose clauses may also vary per tenancy (via {@code customOverrides}).
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

        // Omitted entirely on a fixed term. Notice exists to warn of a departure
        // nobody knew about; a fixed term's last day was agreed on day one, so
        // the system ignores notice for it. Printing the clause anyway would have
        // the agreement promise something the behaviour contradicts — in the one
        // document that is meant to record what both sides actually agreed.
        //
        // Reads the enum's own label, so it says "one month's notice" rather than
        // "30 days'" — one month from 15 Jan is 15 Feb, 30 days is 14 Feb, and
        // the agreement must not promise the wrong one.
        if (!hasFixedTerm(propertyDefaultClauses)) {
            clauses.add(AgreementClause.system(SystemClauseType.NOTICE_PERIOD, "Notice period",
                    "Either party may end this tenancy by giving notice of " + property.noticePeriod().label() + ".",
                    Map.of("noticePeriod", property.noticePeriod().name()), order++));
        }

        // The mirror image of the notice clause above: notice and a premature-exit
        // charge both belong to an open-ended stay, and neither applies to a
        // fixed term, whose last day was agreed on day one and whose early
        // departure is priced by the VALIDITY clause instead.
        if (!hasFixedTerm(propertyDefaultClauses)
                && property.prematureExitPolicy() != null
                && !property.prematureExitPolicy().isBlank()) {
            clauses.add(AgreementClause.system(SystemClauseType.PREMATURE_EXIT, "Leaving without notice",
                    property.prematureExitPolicy().trim(),
                    Map.of("policy", property.prematureExitPolicy().trim()), order++));
        }

        clauses.add(AgreementClause.system(SystemClauseType.GRACE_DAYS, "Rent grace period",
                billingPolicy.rentGraceDays() > 0
                        ? "Rent carries a grace period of " + billingPolicy.rentGraceDays()
                                + " days after the cycle due date."
                        : "Rent is due on the cycle due date, with no grace period.",
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

    /**
     * Whether the property's clause set carries a fixed agreement term.
     *
     * <p>Read off the VALIDITY clause rather than passed in, so the assembler
     * stays a pure function of the clause sources it already receives. LOCK_IN is
     * accepted too — agreements signed before the rename keep the old name.
     */
    private static boolean hasFixedTerm(List<AgreementClause> propertyDefaultClauses) {
        return nonNull(propertyDefaultClauses).stream()
                .filter(clause -> clause.getKind() == ClauseKind.SYSTEM)
                .filter(clause -> clause.getSystemType() == SystemClauseType.VALIDITY
                        || clause.getSystemType() == SystemClauseType.LOCK_IN)
                .anyMatch(clause -> {
                    Map<String, Object> value = clause.getValue();
                    if (value == null) {
                        return false;
                    }
                    Object months = value.containsKey("validityMonths")
                            ? value.get("validityMonths")
                            : value.get("months");
                    return months instanceof Number number && number.intValue() > 0;
                });
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
