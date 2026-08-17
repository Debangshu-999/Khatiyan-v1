package com.khatiyan.d_modules.property.api.dto;

import java.util.List;

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
        String prematureExitPolicy) {

    public record DamageChargeView(String name, long chargePaise) {
    }

    public static PropertyExitPolicyResponse from(Property property) {
        List<DamageChargeView> charges = property.getDamageCharges().stream()
                .map(charge -> new DamageChargeView(charge.getName(), charge.getChargePaise()))
                .toList();

        return new PropertyExitPolicyResponse(
                charges, List.copyOf(property.getExitChecklist()), property.getPrematureExitPolicy());
    }
}
