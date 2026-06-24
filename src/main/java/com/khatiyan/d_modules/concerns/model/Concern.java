package com.khatiyan.d_modules.concerns.model;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Tenant-raised issue tied to an active tenancy.
 *
 * <p>
 * A concern captures tenant, tenancy, property, and room ids at creation
 * time so owners/managers can manage its lifecycle without cross-module JPA
 * relationships.
 */
@Entity
@Table(name = "concerns", schema = "concern")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Concern extends BaseEntity {

    public static final int MAX_PHOTOS = 4;
    public static final Duration REOPEN_WINDOW = Duration.ofDays(3);

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "raised_by_user_id", nullable = false)
    private UUID raisedByUserId;

    @Column(name = "assigned_to_user_id")
    private UUID assignedToUserId;

    @Column(name = "assigned_by_user_id")
    private UUID assignedByUserId;

    @Column(name = "assigned_at")
    private Instant assignedAt;

    @Column(name = "in_progress_by_user_id")
    private UUID inProgressByUserId;

    @Column(name = "in_progress_at")
    private Instant inProgressAt;

    @Column(name = "resolved_by_user_id")
    private UUID resolvedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ConcernCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "escalation_level", nullable = false, length = 20)
    private ConcernEscalationLevel escalationLevel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ConcernStatus status;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 1000)
    private String description;

    @Column(name = "resolution_note", length = 1000)
    private String resolutionNote;

    @Column(name = "status_note", length = 1000)
    private String statusNote;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "reopen_until")
    private Instant reopenUntil;

    @Column(nullable = false)
    private boolean reopened;

    @Column(name = "reopen_reason", length = 1000)
    private String reopenReason;

    @Column(name = "reopened_at")
    private Instant reopenedAt;

    @BatchSize(size = 50)
    @OneToMany(mappedBy = "concern", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ConcernPhoto> photos = new ArrayList<>();

    private Concern(
            String referenceCode,
            UUID propertyId,
            UUID roomId,
            UUID tenancyId,
            UUID raisedByUserId,
            ConcernCategory category,
            String title,
            String description) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.tenancyId = tenancyId;
        this.raisedByUserId = raisedByUserId;
        this.category = category;
        this.escalationLevel = ConcernEscalationLevel.NONE;
        this.status = ConcernStatus.OPEN;
        this.title = title;
        this.description = description;
    }

    public static Concern raise(
            UUID propertyId,
            UUID roomId,
            UUID tenancyId,
            UUID raisedByUserId,
            ConcernCategory category,
            String title,
            String description) {
        return raise(
                "CON-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                propertyId,
                roomId,
                tenancyId,
                raisedByUserId,
                category,
                title,
                description);
    }

    public static Concern raise(
            String referenceCode,
            UUID propertyId,
            UUID roomId,
            UUID tenancyId,
            UUID raisedByUserId,
            ConcernCategory category,
            String title,
            String description) {
        return new Concern(
                referenceCode,
                propertyId,
                roomId,
                tenancyId,
                raisedByUserId,
                category,
                title,
                description);
    }

    public void addPhoto(String photoUrl, String photoPublicId) {
        if (photos.size() >= MAX_PHOTOS) {
            throw new IllegalStateException("A concern can have at most 4 photos");
        }

        photos.add(ConcernPhoto.create(this, photoUrl, photoPublicId, photos.size()));
    }

    public void assignTo(UUID assignedToUserId, UUID assignedByUserId, Instant assignedAt) {
        ensureOpenForWork();
        this.assignedToUserId = assignedToUserId;
        this.assignedByUserId = assignedByUserId;
        this.assignedAt = assignedAt;
        this.status = ConcernStatus.UNDER_REVIEW;
    }

    public void markOpen() {
        ensureOpenForWork();
        this.assignedToUserId = null;
        this.reopened = false;
        this.reopenReason = null;
        this.reopenedAt = null;
        this.status = ConcernStatus.OPEN;
    }

    public void updateStatusNote(String statusNote) {
        this.statusNote = statusNote;
    }

    public void markUnderReview(UUID assignedToUserId, Instant assignedAt) {
        ensureOpenForWork();
        this.assignedToUserId = assignedToUserId;
        this.assignedByUserId = assignedToUserId;
        this.assignedAt = assignedAt;
        this.status = ConcernStatus.UNDER_REVIEW;
    }

    public void markInProgress(UUID assignedToUserId, Instant inProgressAt) {
        ensureOpenForWork();
        if (this.assignedToUserId != null && !this.assignedToUserId.equals(assignedToUserId)) {
            throw new IllegalStateException("Only the assigned user can mark this concern in progress");
        }
        this.assignedToUserId = assignedToUserId;
        this.inProgressByUserId = assignedToUserId;
        this.inProgressAt = inProgressAt;
        this.status = ConcernStatus.IN_PROGRESS;
        // Escalation level is preserved while a concern is worked on (only
        // cleared on resolve) so that releasing it sends it back to the
        // escalation queue rather than the normal available list.
    }

    public void resolve(UUID resolvedByUserId, String resolutionNote, Instant resolvedAt) {
        ensureOpenForWork();
        this.status = ConcernStatus.RESOLVED;
        this.escalationLevel = ConcernEscalationLevel.NONE;
        this.resolvedByUserId = resolvedByUserId;
        this.resolutionNote = resolutionNote;
        this.statusNote = null;
        this.resolvedAt = resolvedAt;
        this.reopenUntil = resolvedAt.plus(REOPEN_WINDOW);
        this.reopened = false;
        this.reopenReason = null;
        this.reopenedAt = null;
    }

    public void reopen(String reopenReason, Instant now) {
        if (status != ConcernStatus.RESOLVED) {
            throw new IllegalStateException("Only resolved concerns can be reopened");
        }

        if (reopenUntil == null || now.isAfter(reopenUntil)) {
            throw new IllegalStateException("Concern reopen window has expired");
        }

        if (resolvedByUserId == null) {
            throw new IllegalStateException("Resolved concern has no resolver to reassign");
        }

        this.assignedToUserId = resolvedByUserId;
        this.status = ConcernStatus.IN_PROGRESS;
        this.escalationLevel = ConcernEscalationLevel.NONE;
        this.reopened = true;
        this.reopenReason = reopenReason;
        this.statusNote = reopenReason;
        this.reopenedAt = now;
        
        this.resolvedByUserId = null;
        this.resolutionNote = null;
        this.resolvedAt = null;
        this.reopenUntil = null;
    }

    public void closeAfterReopenWindow(Instant now) {
        if (status != ConcernStatus.RESOLVED) {
            throw new IllegalStateException("Only resolved concerns can be closed");
        }

        if (reopenUntil != null && now.isBefore(reopenUntil)) {
            throw new IllegalStateException("Concern reopen window is still active");
        }

        this.status = ConcernStatus.CLOSED;
        this.escalationLevel = ConcernEscalationLevel.NONE;
    }

    public boolean refreshEscalationLevel(Instant now) {
        ConcernEscalationLevel nextLevel = nextEscalationLevel(now);
        if (this.escalationLevel == nextLevel) {
            return false;
        }

        this.escalationLevel = nextLevel;
        return true;
    }

    private ConcernEscalationLevel nextEscalationLevel(Instant now) {
        if (status != ConcernStatus.OPEN && status != ConcernStatus.UNDER_REVIEW) {
            return ConcernEscalationLevel.NONE;
        }

        if (getCreatedAt() == null || now == null || now.isBefore(getCreatedAt())) {
            return ConcernEscalationLevel.NONE;
        }

        return ConcernEscalationLevel.fromWaitingAge(Duration.between(getCreatedAt(), now));
    }

    private void ensureOpenForWork() {
        if (status == ConcernStatus.RESOLVED || status == ConcernStatus.CLOSED) {
            throw new IllegalStateException("Concern is already resolved or has been closed by management");
        }
    }
}
