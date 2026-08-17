package com.khatiyan.d_modules.tenancy.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Tenant request to move rooms at the current billing-cycle boundary.
 */
@Entity
@Table(name = "tenancy_room_change_requests", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenancyRoomChangeRequest extends BaseEntity {

    /** Mirrors the exit request's review window; both sweeps share the value. */
    public static final int REVIEW_WINDOW_DAYS = 5;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    /** Short user-facing code. The UUID stays internal and is never displayed. */
    @Column(name = "reference_code", nullable = false, length = 40, unique = true)
    private String referenceCode;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "current_room_id", nullable = false)
    private UUID currentRoomId;

    @Column(name = "target_room_id", nullable = false)
    private UUID targetRoomId;

    @Column(name = "billing_cycle_id", nullable = false)
    private UUID billingCycleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TenancyRoomChangeRequestStatus status;

    @Column(name = "effective_transfer_date", nullable = false)
    private LocalDate effectiveTransferDate;

    @Column(name = "tenant_reason", length = 500)
    private String tenantReason;

    @Column(name = "admin_notes", length = 500)
    private String adminNotes;

    @Column(name = "requested_room_rent_amount_paise", nullable = false)
    private long requestedRoomRentAmountPaise;

    @Column(name = "executed_rent_amount_paise")
    private Long executedRentAmountPaise;

    @Column(name = "decided_by_user_id")
    private UUID decidedByUserId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "executed_at")
    private Instant executedAt;

    /**
     * When this request stops being interactive.
     *
     * <p>Room changes expire the moment they are decided — there is no
     * withdrawal after approval, so nothing remains for either side to do.
     */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Builder
    private TenancyRoomChangeRequest(
            String referenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID currentRoomId,
            UUID targetRoomId,
            UUID billingCycleId,
            LocalDate effectiveTransferDate,
            String tenantReason,
            long requestedRoomRentAmountPaise) {
        if (tenancyId == null || tenantUserId == null || propertyId == null || currentRoomId == null
                || targetRoomId == null || billingCycleId == null) {
            throw new ValidationException("Room change request tenancy details are required");
        }
        if (currentRoomId.equals(targetRoomId)) {
            throw new ValidationException("Target room must be different from current room");
        }
        if (effectiveTransferDate == null) {
            throw new ValidationException("Effective transfer date is required");
        }
        if (requestedRoomRentAmountPaise <= 0) {
            throw new ValidationException("Target room rent must be positive");
        }

        this.id = UUID.randomUUID();
        // Local fallback for tests; the service supplies the sequenced code.
        this.referenceCode = referenceCode != null
                ? referenceCode
                : "TRC-LOCAL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.currentRoomId = currentRoomId;
        this.targetRoomId = targetRoomId;
        this.billingCycleId = billingCycleId;
        this.status = TenancyRoomChangeRequestStatus.REQUESTED;
        this.effectiveTransferDate = effectiveTransferDate;
        this.tenantReason = clean(tenantReason);
        this.requestedRoomRentAmountPaise = requestedRoomRentAmountPaise;
        this.expiresAt = Instant.now().plus(java.time.Duration.ofDays(REVIEW_WINDOW_DAYS));
    }

    public static TenancyRoomChangeRequest request(
            String referenceCode,
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID currentRoomId,
            UUID targetRoomId,
            UUID billingCycleId,
            LocalDate effectiveTransferDate,
            String tenantReason,
            long requestedRoomRentAmountPaise) {
        return TenancyRoomChangeRequest.builder()
                .referenceCode(referenceCode)
                .tenancyId(tenancyId)
                .tenantUserId(tenantUserId)
                .propertyId(propertyId)
                .currentRoomId(currentRoomId)
                .targetRoomId(targetRoomId)
                .billingCycleId(billingCycleId)
                .effectiveTransferDate(effectiveTransferDate)
                .tenantReason(tenantReason)
                .requestedRoomRentAmountPaise(requestedRoomRentAmountPaise)
                .build();
    }

    public void approve(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.APPROVED;
        this.expiresAt = Instant.now();
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void reject(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.REJECTED;
        this.expiresAt = Instant.now();
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void cancel(UUID tenantUserId) {
        ensureRequested();
        if (!this.tenantUserId.equals(tenantUserId)) {
            throw new ValidationException("Only the tenant can cancel this room change request");
        }
        this.status = TenancyRoomChangeRequestStatus.CANCELLED;
        this.expiresAt = Instant.now();
    }

    /**
     * Nobody reviewed this request within the review window.
     *
     * <p>Only from REQUESTED: an approved room change holds a reserved bed and
     * must be released deliberately, not by a sweep. Expiry here changes nothing
     * else — no bed moves, no rent changes — which is what makes it safe to run
     * unattended. The tenant simply asks again; there is no re-raise carve-out
     * on room changes, because the owner holds a genuine veto over them.
     */
    public void expire() {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.EXPIRED;
        this.expiresAt = Instant.now();
    }

    /**
     * Closes an open request because the tenancy it belongs to has ended, so the
     * move can never run. Unlike {@link #cancel}, this is a system action and is
     * allowed from APPROVED — that is the state that holds a reserved bed.
     *
     * @return true if the request had been approved, i.e. a bed is still held
     *         for it and must be released
     */
    /** Whether either party still has something they can do about this. */
    public boolean isActivelyOpen(Instant now) {
        return expiresAt == null || expiresAt.isAfter(now);
    }

    public boolean cancelBecauseTenancyEnded() {
        boolean heldReservation = status == TenancyRoomChangeRequestStatus.APPROVED;
        if (status != TenancyRoomChangeRequestStatus.REQUESTED && !heldReservation) {
            return false;
        }

        this.status = TenancyRoomChangeRequestStatus.CANCELLED;
        return heldReservation;
    }

    public void markExecuted(long executedRentAmountPaise) {
        if (status != TenancyRoomChangeRequestStatus.APPROVED) {
            throw new ValidationException("Only approved room change requests can be executed");
        }
        if (executedRentAmountPaise <= 0) {
            throw new ValidationException("Executed rent amount must be positive");
        }

        this.status = TenancyRoomChangeRequestStatus.EXECUTED;
        this.executedRentAmountPaise = executedRentAmountPaise;
        this.executedAt = Instant.now();
    }

    private void ensureRequested() {
        if (status != TenancyRoomChangeRequestStatus.REQUESTED) {
            throw new ValidationException("Room change request is not pending review");
        }
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
