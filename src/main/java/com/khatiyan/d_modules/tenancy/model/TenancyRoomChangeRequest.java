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

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

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

    @Builder
    private TenancyRoomChangeRequest(
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
    }

    public static TenancyRoomChangeRequest request(
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
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void reject(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyRoomChangeRequestStatus.REJECTED;
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
