package com.khatiyan.d_modules.property.api.dto;

import java.util.Arrays;
import java.util.List;

import com.khatiyan.d_modules.property.model.DeductionCategory;
import com.khatiyan.d_modules.property.model.Property;

/**
 * Read model for a property's exit policies: the damage-charge schedule and the
 * move-out checklist. Read by the owner exit-policy screen, the end-tenancy
 * checklist screen, the compliance agreement assembler, and deposit settlement.
 */
public record PropertyExitPolicyResponse(
        List<DamageChargeView> damageCharges,
        List<String> exitChecklist,
        /** Null when the owner has not written one. */
        String prematureExitPolicy,
        /** What the deposit may be used for, always in enum order. */
        List<DeductionCategory> permittedDeductions) {

    public record DamageChargeView(String name, long chargePaise) {
    }

    public static PropertyExitPolicyResponse from(Property property) {
        List<DamageChargeView> charges = property.getDamageCharges().stream()
                .map(charge -> new DamageChargeView(charge.getName(), charge.getChargePaise()))
                .toList();

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
                List.copyOf(property.getExitChecklist()),
                property.getPrematureExitPolicy(),
                deductions);
    }
}
