package com.khatiyan.d_modules.tenancy.model;

import com.khatiyan.d_modules.property.model.DamageLevel;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One thing in the room at move-in and how damaged it was. {@code custom}
 * marks an item added by hand rather than taken from the room's amenities or
 * the property's damage list: at move-out it is charged by the handler.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MoveInChecklistItem {

    @Column(name = "name", nullable = false, length = 80)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "damage_level", nullable = false, length = 4)
    private DamageLevel damageLevel;

    /** What exactly is damaged, when anything is. Optional. */
    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "custom", nullable = false)
    private boolean custom;

    /** Working, Damaged or Broken (2026-11-07). Null on items recorded before it existed. */
    @Enumerated(EnumType.STRING)
    @Column(name = "item_condition", length = 10)
    private ItemCondition itemCondition;

    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(name = "section", nullable = false, length = 10)
    private MoveInSection section = MoveInSection.ROOM;

    /** 1 to 3 photos of this item (V6248, user, 2026-10-29). */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "photo_urls", columnDefinition = "jsonb", nullable = false)
    private java.util.List<String> photoUrls = new java.util.ArrayList<>();

    public MoveInChecklistItem(String name, DamageLevel damageLevel, String note, boolean custom, java.util.List<String> photoUrls) {
        this(name, damageLevel, note, custom, photoUrls, MoveInSection.ROOM);
    }

    public MoveInChecklistItem(String name, DamageLevel damageLevel, String note, boolean custom,
            java.util.List<String> photoUrls, MoveInSection section) {
        this(name, damageLevel, null, note, custom, photoUrls, section);
    }

    public MoveInChecklistItem(String name, DamageLevel damageLevel, ItemCondition condition, String note, boolean custom,
            java.util.List<String> photoUrls, MoveInSection section) {
        if (photoUrls == null || photoUrls.isEmpty()) {
            throw new com.khatiyan.c_shared.exception.ValidationException("Add at least one photo of " + name);
        }
        if (photoUrls.size() > 3) {
            throw new com.khatiyan.c_shared.exception.ValidationException("Add at most 3 photos of " + name);
        }
        // No note is asked for (user, 2026-11-07): the move-in checklist no longer records
        // damage, it carries each item's level from the room as it stands.
        this.name = name;
        this.damageLevel = damageLevel == null ? DamageLevel.NA : damageLevel;
        this.itemCondition = condition;
        this.note = note;
        this.custom = custom;
        this.photoUrls = new java.util.ArrayList<>(photoUrls);
        this.section = section == null ? MoveInSection.ROOM : section;
    }

    /** The condition, or for an item recorded before conditions, what its level reads as. */
    public ItemCondition condition() {
        return itemCondition != null ? itemCondition : ItemCondition.fromLevel(damageLevel);
    }
}
