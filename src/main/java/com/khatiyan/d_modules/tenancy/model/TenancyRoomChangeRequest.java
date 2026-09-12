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
    public static final int DECISION_VISIBILITY_DAYS = 3;

    /**
     * The re-raise carve-out, on the same terms as an exit request's.
     *
     * <p>48 hours to correct a rejected move, and two corrections per original
     * request. A room change costs nothing to re-raise and reserves a bed the
     * moment it is approved, so an uncapped chain is worse here than on the exit
     * side: the same tenant can keep a stream of requests pointed at a room
     * somebody else is waiting for.
     */
    public static final int RE_RAISE_WINDOW_HOURS = 48;
    public static final int RE_RAISE_LIMIT = 2;

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

    /** The rejected request this corrected request replaces, if any. */
    @Column(name = "superseded_request_id")
    private UUID supersededRequestId;

    /** How many re-raises stand between this request and the original. */
    @Column(name = "re_raise_count", nullable = false)
    private int reRaiseCount;

    /**
     * When this request stops being interactive.
     *
     * <p>A rejected request stays visible for its correction window. An
     * approved request stays reversible by management for a short window even
     * though it remains scheduled after that window closes.
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
            long requestedRoomRentAmountPaise,
            UUID supersededRequestId,
            int reRaiseCount) {
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
        this.supersededRequestId = supersededRequestId;
        this.reRaiseCount = reRaiseCount;
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
        return request(referenceCode, tenancyId, tenantUserId, propertyId, currentRoomId,
                targetRoomId, billingCycleId, effectiveTransferDate, tenantReason,
                requestedRoomRentAmountPaise, null);
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
            long requestedRoomRentAmountPaise,
            TenancyRoomChangeRequest superseded) {
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
                .supersededRequestId(superseded == null ? null : superseded.getId())
                .reRaiseCount(superseded == null ? 0 : superseded.getReRaiseCount() + 1)
                .build();
    }

    public void approve(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.APPROVED;
        this.expiresAt = Instant.now().plus(java.time.Duration.ofDays(DECISION_VISIBILITY_DAYS));
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void reject(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.REJECTED;
        this.expiresAt = Instant.now().plus(java.time.Duration.ofHours(RE_RAISE_WINDOW_HOURS));
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    /** Whether management may still undo an approval before execution. */
    public boolean allowsApprovalRevertAt(Instant now) {
        return status == TenancyRoomChangeRequestStatus.APPROVED
                && executedAt == null
                && expiresAt != null
                && expiresAt.isAfter(now);
    }

    /**
     * Returns an approved move to the decision queue.
     *
     * <p>The service releases the target-bed reservation in the same
     * transaction. Rejected requests deliberately cannot use this transition:
     * rejection frees the tenancy to raise an exit request, so reviving it
     * could create two competing active requests.
     */
    public void revertApproval(Instant now) {
        if (!allowsApprovalRevertAt(now)) {
            throw new ValidationException("Room change approval can no longer be reverted");
        }
        reopenForDecision(now, null);
    }

    /**
     * Closes an approved move whose scheduled run could not complete.
     *
     * <p>
     * Cancelled, not reopened. Putting it back in the decision queue kept its
     * transfer date and billing cycle, both already past, so approving it again
     * ran it against stale values. It is closed with the reason instead, the
     * service releases its reserved bed and tells everyone, and the tenant raises
     * a fresh request if they still want to move.
     */
    public void cancelAfterExecutionFailure(Instant now, String reason) {
        if (status != TenancyRoomChangeRequestStatus.APPROVED || executedAt != null) {
            throw new ValidationException("Only an unexecuted approved room change can be cancelled");
        }
        this.status = TenancyRoomChangeRequestStatus.CANCELLED;
        this.expiresAt = now;
        this.adminNotes = truncate(clean(reason), 500);
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
     * move can never run. This is a system action and is allowed from APPROVED
     * — that is the state that holds a reserved bed.
     *
     * @return true if the request had been approved, i.e. a bed is still held
     *         for it and must be released
     */
    /** Whether either party still has something they can do about this. */
    public boolean isActivelyOpen(Instant now) {
        return expiresAt == null || expiresAt.isAfter(now);
    }

    /**
     * A rejected request may be corrected and re-raised for exactly 48 hours,
     * and only twice before the tenant has to start over.
     */
    public boolean allowsReRaiseAt(Instant now) {
        return status == TenancyRoomChangeRequestStatus.REJECTED
                && reRaiseCount < RE_RAISE_LIMIT
                && expiresAt != null
                && expiresAt.isAfter(now);
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

    private void reopenForDecision(Instant now, String notes) {
        this.status = TenancyRoomChangeRequestStatus.REQUESTED;
        this.expiresAt = now.plus(java.time.Duration.ofDays(REVIEW_WINDOW_DAYS));
        this.adminNotes = clean(notes);
        this.decidedByUserId = null;
        this.decidedAt = null;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
