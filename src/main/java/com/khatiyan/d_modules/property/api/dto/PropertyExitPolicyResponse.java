package com.khatiyan.d_modules.property.api.dto;

import java.util.Arrays;
import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.property.model.DeductionCategory;
import com.khatiyan.d_modules.property.model.Property;

/**
 * Read model for a property's exit policies: the damage-charge schedule and the
 * move-out checklist. Read by the owner exit-policy screen, the end-tenancy
 * checklist screen, the compliance agreement assembler, and deposit settlement.
 */
public record PropertyExitPolicyResponse(
        List<DamageChargeView> damageCharges,
        /** NA, D1, D2, D3 in order, each with what it means here (2026-10-29). */
        List<DamageLevelView> damageLevels,
        List<String> exitChecklist,
        /** Null when the owner has not written one. */
        String prematureExitPolicy,
        /** What the deposit may be used for, always in enum order. */
        List<DeductionCategory> permittedDeductions,
        /** The property's version (2026-09-29): the policies live on it. */
        long version) {

    /** {@code chargePaise} is D3's price, the one flat amount the deed still prints. */
    /** D2 and D3 null when the item stops below them. {@code chargePaise} is the highest priced level. */
    public record DamageChargeView(String name, long chargePaise, Long d1Paise, Long d2Paise, Long d3Paise,
            com.khatiyan.d_modules.property.model.DamageCategory category) {
    }

    public record DamageLevelView(DamageLevel level, String description) {
    }

    public static PropertyExitPolicyResponse from(Property property) {
        List<DamageChargeView> charges = property.getDamageCharges().stream()
                .map(charge -> new DamageChargeView(charge.getName(), charge.getChargePaise(),
                        charge.getD1Paise(), charge.getD2Paise(), charge.getD3Paise(), charge.getCategory()))
                .toList();
        List<DamageLevelView> levels = List.of(
                new DamageLevelView(DamageLevel.NA, "No damage"),
                new DamageLevelView(DamageLevel.D1, property.getDamageLevelD1()),
                new DamageLevelView(DamageLevel.D2, property.getDamageLevelD2()),
                new DamageLevelView(DamageLevel.D3, property.getDamageLevelD3()));

        // Sorted into the enum's own order rather than returned as the set
        // iterates. These are printed verbatim into every deed the property
        // issues, and a hash set's order is not stable across JVMs — two
        // agreements for the same property would list the same deductions
        // differently, which reads as two different policies.
        List<DeductionCategory> deductions = Arrays.stream(DeductionCategory.values())
                .filter(property.getPermittedDeductions()::contains)
                .toList();

        return new PropertyExitPolicyResponse(
                charges,
                levels,
                List.copyOf(property.getExitChecklist()),
                property.getPrematureExitPolicy(),
                deductions, property.getVersion());
    }
}
