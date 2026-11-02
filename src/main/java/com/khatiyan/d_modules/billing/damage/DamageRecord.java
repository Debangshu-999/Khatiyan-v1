package com.khatiyan.d_modules.billing.damage;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.DamageLevel;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A damage to one item in one room (2026-10-29): who answers for it, the level
 * it brought the item to, what it costs, photos and a note. Charged once, on a
 * one-off bill, or left for exit settlement. Repaired or replaced, it moves to
 * the Repairs history; the charge is untouched by that.
 *
 * <p>Names one tenant at most (user, 2026-10-31). A split is one record per
 * tenant, sharing a code and numbered "split 1", "split 2".
 */
@Entity
@Table(name = "damage_records", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DamageRecord extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "code", nullable = false, updatable = false, length = 20)
    private String code;

    /** Which split of the damage this is. Null when it was not split. */
    @Column(name = "split_number")
    private Integer splitNumber;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "item_name", nullable = false, length = 80)
    private String itemName;

    /** ROOM or BATHROOM. */
    @Column(name = "section", nullable = false, length = 10)
    private String section;

    @Enumerated(EnumType.STRING)
    @Column(name = "damage_level", nullable = false, length = 4)
    private DamageLevel damageLevel;

    @Column(name = "cost_paise", nullable = false)
    private long costPaise;

    @Column(name = "note", length = 300)
    private String note;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "photo_urls", columnDefinition = "jsonb", nullable = false)
    private List<String> photoUrls = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "responsibility", nullable = false, length = 10)
    private DamageResponsibility responsibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private DamageRecordSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private DamageRecordStatus status;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "damage_record_shares", schema = "billing", joinColumns = @JoinColumn(name = "record_id"))
    @OrderColumn(name = "display_order")
    private List<DamageRecordShare> shares = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "repaired_level", length = 4)
    private DamageLevel repairedLevel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "repair_photo_urls", columnDefinition = "jsonb")
    private List<String> repairPhotoUrls;

    @Column(name = "repair_note", length = 300)
    private String repairNote;

    @Column(name = "repaired_at")
    private Instant repairedAt;

    @Column(name = "repaired_by")
    private UUID repairedBy;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    public static DamageRecord record(String code, UUID propertyId, UUID roomId, String itemName, String section,
            DamageLevel level, long costPaise, String note, List<String> photoUrls,
            DamageResponsibility responsibility, DamageRecordSource source, List<DamageRecordShare> shares,
            UUID actorUserId) {
        DamageRecord record = new DamageRecord();
        record.id = UUID.randomUUID();
        record.code = code;
        record.propertyId = propertyId;
        record.source = source;
        record.status = DamageRecordStatus.OPEN;
        record.createdBy = actorUserId;
        record.describe(roomId, itemName, section, level, costPaise, note, photoUrls, responsibility, shares);
        return record;
    }

    /** The facts, as recorded or edited. The money rules live in the service. */
    public void describe(UUID roomId, String itemName, String section, DamageLevel level, long costPaise,
            String note, List<String> photoUrls, DamageResponsibility responsibility, List<DamageRecordShare> shares) {
        if (itemName == null || itemName.isBlank()) {
            throw new ValidationException("Pick the item");
        }
        if (photoUrls == null || photoUrls.isEmpty()) {
            throw new ValidationException("Add at least one photo of the damage");
        }
        if (photoUrls.size() > 3) {
            throw new ValidationException("Add at most 3 photos");
        }
        if (costPaise < 0) {
            throw new ValidationException("The cost cannot be negative");
        }
        this.roomId = roomId;
        this.itemName = itemName.trim();
        this.section = "BATHROOM".equals(section) ? "BATHROOM" : "ROOM";
        this.damageLevel = level;
        this.costPaise = costPaise;
        this.note = note == null || note.isBlank() ? null : note.trim();
        this.photoUrls = new ArrayList<>(photoUrls);
        this.responsibility = responsibility;
        this.shares = new ArrayList<>(shares);
    }

    void splitAs(int number) {
        this.splitNumber = number;
    }

    /** Only the note and photos changed: nothing about the money moves. */
    public void retouch(String note, List<String> photoUrls) {
        if (photoUrls == null || photoUrls.isEmpty() || photoUrls.size() > 3) {
            throw new ValidationException("Add 1 to 3 photos of the damage");
        }
        this.note = note == null || note.isBlank() ? null : note.trim();
        this.photoUrls = new ArrayList<>(photoUrls);
    }

    public void repaired(DamageRecordStatus outcome, DamageLevel level, List<String> photos, String note,
            UUID actorUserId, Instant now) {
        if (status != DamageRecordStatus.OPEN) {
            throw new ValidationException("This damage is already " + status.name().toLowerCase(java.util.Locale.ROOT) + ".");
        }
        if (photos == null || photos.isEmpty() || photos.size() > 3) {
            throw new ValidationException("Add 1 to 3 photos of the fix");
        }
        this.status = outcome;
        this.repairedLevel = level;
        this.repairPhotoUrls = new ArrayList<>(photos);
        this.repairNote = note == null || note.isBlank() ? null : note.trim();
        this.repairedAt = now;
        this.repairedBy = actorUserId;
    }

    public boolean charged() {
        return !shares.isEmpty() && shares.stream().allMatch(share -> share.getBillId() != null);
    }

    void billShare(int index, UUID billId) {
        shares.get(index).billedAs(billId);
    }

    void unbillAll() {
        shares.forEach(DamageRecordShare::unbill);
    }
}
