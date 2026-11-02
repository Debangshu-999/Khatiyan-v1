package com.khatiyan.d_modules.property.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One item's running condition in one room (2026-10-29): its damage level and
 * its latest photos. Set by the room's move-in checklists, raised by a damage
 * record, reset by a repair or replacement. The next onboarding starts from it.
 */
@Entity
@Table(name = "room_item_conditions", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoomItemCondition extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "room_id", nullable = false, updatable = false)
    private UUID roomId;

    /** The trimmed, lower-cased name: one row per item per room. */
    @Column(name = "item_key", nullable = false, updatable = false, length = 80)
    private String itemKey;

    @Column(name = "item_name", nullable = false, length = 80)
    private String itemName;

    /** ROOM or BATHROOM. */
    @Column(name = "section", nullable = false, length = 10)
    private String section;

    @Enumerated(EnumType.STRING)
    @Column(name = "damage_level", nullable = false, length = 4)
    private DamageLevel damageLevel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "photo_urls", columnDefinition = "jsonb", nullable = false)
    private List<String> photoUrls = new ArrayList<>();

    @Column(name = "updated_by")
    private UUID updatedBy;

    public static String keyOf(String itemName) {
        return itemName == null ? "" : itemName.trim().toLowerCase(Locale.ROOT);
    }

    public static RoomItemCondition create(UUID roomId, String itemName, String section) {
        RoomItemCondition condition = new RoomItemCondition();
        condition.id = UUID.randomUUID();
        condition.roomId = roomId;
        condition.itemKey = keyOf(itemName);
        condition.itemName = itemName.trim();
        condition.section = normaliseSection(section);
        condition.damageLevel = DamageLevel.NA;
        return condition;
    }

    /** Sets the level and photos exactly: a move-in checklist, a repair. */
    public void set(DamageLevel level, List<String> photos, UUID actorUserId) {
        this.damageLevel = level == null ? DamageLevel.NA : level;
        this.photoUrls = photos == null ? new ArrayList<>() : new ArrayList<>(photos);
        this.updatedBy = actorUserId;
    }

    /** A damage: the level never drops here, the photos become the latest. */
    public void raise(DamageLevel level, List<String> photos, UUID actorUserId) {
        if (level != null && level.ordinal() > this.damageLevel.ordinal()) {
            this.damageLevel = level;
        }
        if (photos != null && !photos.isEmpty()) {
            this.photoUrls = new ArrayList<>(photos);
        }
        this.updatedBy = actorUserId;
    }

    public void rename(String itemName, String section) {
        this.itemName = itemName.trim();
        this.section = normaliseSection(section);
    }

    private static String normaliseSection(String section) {
        return "BATHROOM".equals(section) ? "BATHROOM" : "ROOM";
    }
}
