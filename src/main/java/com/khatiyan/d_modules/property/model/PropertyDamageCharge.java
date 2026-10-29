package com.khatiyan.d_modules.property.model;

import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One entry in a property's damage-charge schedule: a named item, its
 * category, and what each damage level costs for it.
 *
 * <p>An item has up to three priced levels (user, 2026-10-29): D1, then D2,
 * then D3, each costing at least the one before. None at all is an item on the
 * list not priced yet: the damage list is what the move-in checklist's room and
 * bathroom are made of, priced or not. Removing a level
 * moves the ones above it down. {@code chargePaise} is kept equal to the
 * highest priced level: the deed and the end-tenancy screen still read one flat
 * amount until move-out charges by level.
 *
 * <p>Property-owned (not per-agreement) so every monthly tenancy, with or
 * without an agreement, is charged the same rates.
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

    /** Null when the item is not priced yet. */
    @Column(name = "d1_paise")
    private Long d1Paise;

    /** Null when the item has only D1. */
    @Column(name = "d2_paise")
    private Long d2Paise;

    /** Null when the item stops at D2 or D1. */
    @Column(name = "d3_paise")
    private Long d3Paise;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private DamageCategory category = DamageCategory.ROOM;

    private PropertyDamageCharge(String name, Long d1Paise, Long d2Paise, Long d3Paise, DamageCategory category) {
        this.name = name;
        this.d1Paise = d1Paise;
        this.d2Paise = d2Paise;
        this.d3Paise = d3Paise;
        this.category = category == null ? DamageCategory.ROOM : category;
        this.chargePaise = d3Paise != null ? d3Paise : d2Paise != null ? d2Paise : d1Paise != null ? d1Paise : 0L;
    }

    /** An item on the list with no price yet: charged nothing, until it is priced. */
    public static PropertyDamageCharge unpriced(String name, DamageCategory category) {
        return of(name, null, null, null, category);
    }

    public boolean isPriced() {
        return d1Paise != null;
    }

    /** One price for every level: the flat charge as it was before levels. */
    public static PropertyDamageCharge of(String name, long chargePaise) {
        return of(name, chargePaise, chargePaise, chargePaise, DamageCategory.ROOM);
    }

    public static PropertyDamageCharge of(String name, Long d1Paise, Long d2Paise, Long d3Paise) {
        return of(name, d1Paise, d2Paise, d3Paise, DamageCategory.ROOM);
    }

    /** What D1, and D2 and D3 when priced, cost for this item. Never less at a worse level. */
    public static PropertyDamageCharge of(String name, Long d1Paise, Long d2Paise, Long d3Paise, DamageCategory category) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            throw new ValidationException("Damage charge name is required");
        }
        if (normalized.length() > MAX_NAME_LENGTH) {
            throw new ValidationException("Damage charge name must be at most 80 characters");
        }
        if (category == DamageCategory.COMMON_TOILET && d1Paise != null) {
            throw new ValidationException("A common toilet's things are listed, not priced: " + normalized);
        }
        if (d1Paise == null && (d2Paise != null || d3Paise != null)) {
            throw new ValidationException("Price D1 first for " + normalized);
        }
        if ((d1Paise != null && d1Paise < 0) || (d2Paise != null && d2Paise < 0) || (d3Paise != null && d3Paise < 0)) {
            throw new ValidationException("Damage charge amount cannot be negative");
        }
        if (d3Paise != null && d2Paise == null) {
            throw new ValidationException("Price D2 before D3 for " + normalized);
        }
        if ((d2Paise != null && d2Paise < d1Paise) || (d3Paise != null && d3Paise < d2Paise)) {
            throw new ValidationException("A worse damage level cannot cost less: D1 up to D2, D2 up to D3");
        }

        return new PropertyDamageCharge(normalized, d1Paise, d2Paise, d3Paise, category);
    }

    /** What this item costs at a level: NA nothing, an unpriced level null. */
    public Long priceAt(DamageLevel level) {
        return switch (level) {
            case NA -> 0L;
            case D1 -> d1Paise;
            case D2 -> d2Paise;
            case D3 -> d3Paise;
        };
    }
}
