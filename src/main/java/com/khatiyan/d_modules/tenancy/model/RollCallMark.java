package com.khatiyan.d_modules.tenancy.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

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
 * One stay's mark for one night (user, 2026-11-15). A warden's mark wins over a
 * tenant's, and a verified mark is never replaced by a self-mark.
 */
@Entity
@Table(name = "roll_call_marks", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RollCallMark extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenancy_id", nullable = false, updatable = false)
    private UUID tenancyId;

    @Column(nullable = false, updatable = false)
    private LocalDate night;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RollCallStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RollCallMethod method;

    @Column(name = "marked_at", nullable = false)
    private Instant markedAt;

    @Column(name = "marked_by_user_id", nullable = false)
    private UUID markedByUserId;

    public static RollCallMark of(UUID propertyId, UUID tenancyId, LocalDate night,
            RollCallStatus status, RollCallMethod method, Instant at, UUID by) {
        RollCallMark mark = new RollCallMark();
        mark.id = UUID.randomUUID();
        mark.propertyId = propertyId;
        mark.tenancyId = tenancyId;
        mark.night = night;
        mark.status = status;
        mark.method = method;
        mark.markedAt = at;
        mark.markedByUserId = by;
        return mark;
    }

    public void replaceBy(RollCallStatus status, RollCallMethod method, Instant at, UUID by) {
        this.status = status;
        this.method = method;
        this.markedAt = at;
        this.markedByUserId = by;
    }
}
