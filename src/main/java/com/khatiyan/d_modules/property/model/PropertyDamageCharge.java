package com.khatiyan.d_modules.property.model;

import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One entry in a property's damage-charge schedule: a named repairable item and
 * the flat amount charged for considerable damage to it at deposit settlement.
 *
 * <p>Property-owned (not per-agreement) so every monthly tenancy — with or
 * without an agreement — can be charged the same rates. Deliberately flat: no
 * depreciation, the owner judges "considerable damage" at settlement time.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyDamageCharge {

    private static final int MAX_NAME_LENGTH = 80;

    @Column(name = "name", nullable = false, length = MAX_NAME_LENGTH)
    private String name;

    @Column(name = "charge_paise", nullable = false)
    private long chargePaise;

    private PropertyDamageCharge(String name, long chargePaise) {
        this.name = name;
        this.chargePaise = chargePaise;
    }

    public static PropertyDamageCharge of(String name, long chargePaise) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            throw new ValidationException("Damage charge name is required");
        }
        if (normalized.length() > MAX_NAME_LENGTH) {
            throw new ValidationException("Damage charge name must be at most 80 characters");
        }
        if (chargePaise < 0) {
            throw new ValidationException("Damage charge amount cannot be negative");
        }

        return new PropertyDamageCharge(normalized, chargePaise);
    }
}
