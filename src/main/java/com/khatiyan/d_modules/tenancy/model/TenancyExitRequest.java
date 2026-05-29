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
 * Tenant-initiated request to end an active tenancy.
 *
 * <p>
 * Normal notice exits are rule-checked by the system. Premature exits are
 * manually reviewed by owner/manager with billing and deposit decisions.
 */
@Entity
@Table(name = "tenancy_exit_requests", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenancyExitRequest extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false)
    private UUID tenancyId;

    @Column(name = "tenant_user_id", nullable = false)
    private UUID tenantUserId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_id", nullable = false)
    private UUID roomId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TenancyExitRequestType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TenancyExitRequestStatus status;

    @Column(name = "requested_checkout_date", nullable = false)
    private LocalDate requestedCheckoutDate;

    @Column(name = "approved_checkout_date")
    private LocalDate approvedCheckoutDate;

    @Column(name = "tenant_reason", length = 500)
    private String tenantReason;

    @Column(name = "admin_notes", length = 500)
    private String adminNotes;

    @Column(name = "final_billing_amount_paise")
    private Long finalBillingAmountPaise;

    @Column(name = "deposit_payable")
    private Boolean depositPayable;

    @Column(name = "deposit_settlement_amount_paise")
    private Long depositSettlementAmountPaise;

    @Column(name = "decided_by_user_id")
    private UUID decidedByUserId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "executed_at")
    private Instant executedAt;

    @Builder
    private TenancyExitRequest(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            TenancyExitRequestType type,
            LocalDate requestedCheckoutDate,
            String tenantReason) {
        if (tenancyId == null || tenantUserId == null || propertyId == null || roomId == null) {
            throw new ValidationException("Exit request tenancy details are required");
        }
        if (type == null) {
            throw new ValidationException("Exit request type is required");
        }
        if (requestedCheckoutDate == null) {
            throw new ValidationException("Requested checkout date is required");
        }

        this.id = UUID.randomUUID();
        this.tenancyId = tenancyId;
        this.tenantUserId = tenantUserId;
        this.propertyId = propertyId;
        this.roomId = roomId;
        this.type = type;
        this.status = TenancyExitRequestStatus.REQUESTED;
        this.requestedCheckoutDate = requestedCheckoutDate;
        this.tenantReason = clean(tenantReason);
    }

    public static TenancyExitRequest normalNotice(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate calculatedCheckoutDate,
            String reason) {
        return TenancyExitRequest.builder()
                .tenancyId(tenancyId)
                .tenantUserId(tenantUserId)
                .propertyId(propertyId)
                .roomId(roomId)
                .type(TenancyExitRequestType.NORMAL_NOTICE)
                .requestedCheckoutDate(calculatedCheckoutDate)
                .tenantReason(reason)
                .build();
    }

    public static TenancyExitRequest premature(
            UUID tenancyId,
            UUID tenantUserId,
            UUID propertyId,
            UUID roomId,
            LocalDate requestedCheckoutDate,
            String reason) {
        return TenancyExitRequest.builder()
                .tenancyId(tenancyId)
                .tenantUserId(tenantUserId)
                .propertyId(propertyId)
                .roomId(roomId)
                .type(TenancyExitRequestType.PREMATURE)
                .requestedCheckoutDate(requestedCheckoutDate)
                .tenantReason(reason)
                .build();
    }

    public void approveNormal(
            UUID actorUserId,
            Long finalBillingAmountPaise,
            Boolean depositPayable,
            Long depositSettlementAmountPaise,
            String adminNotes) {
        ensureRequested();
        validateNonNegative(finalBillingAmountPaise, "Final billing amount cannot be negative");
        validateNonNegative(depositSettlementAmountPaise, "Deposit settlement amount cannot be negative");

        this.status = TenancyExitRequestStatus.APPROVED;
        this.approvedCheckoutDate = requestedCheckoutDate;
        this.finalBillingAmountPaise = finalBillingAmountPaise;
        this.depositPayable = depositPayable;
        this.depositSettlementAmountPaise = depositSettlementAmountPaise;
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void approvePremature(
            UUID actorUserId,
            LocalDate approvedCheckoutDate,
            Long finalBillingAmountPaise,
            Boolean depositPayable,
            Long depositSettlementAmountPaise,
            String adminNotes) {
        ensureRequested();
        if (approvedCheckoutDate == null) {
            throw new ValidationException("Approved checkout date is required");
        }
        validateNonNegative(finalBillingAmountPaise, "Final billing amount cannot be negative");
        validateNonNegative(depositSettlementAmountPaise, "Deposit settlement amount cannot be negative");

        this.status = TenancyExitRequestStatus.APPROVED;
        this.approvedCheckoutDate = approvedCheckoutDate;
        this.finalBillingAmountPaise = finalBillingAmountPaise;
        this.depositPayable = depositPayable;
        this.depositSettlementAmountPaise = depositSettlementAmountPaise;
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void reject(UUID actorUserId, String adminNotes) {
        ensureRequested();
        this.status = TenancyExitRequestStatus.REJECTED;
        this.adminNotes = clean(adminNotes);
        this.decidedByUserId = actorUserId;
        this.decidedAt = Instant.now();
    }

    public void cancel(UUID tenantUserId) {
        ensureRequested();
        if (!this.tenantUserId.equals(tenantUserId)) {
            throw new ValidationException("Only the tenant can cancel this exit request");
        }

        this.status = TenancyExitRequestStatus.CANCELLED;
    }

    public void markExecuted() {
        if (status != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only approved exit requests can be executed");
        }

        this.status = TenancyExitRequestStatus.EXECUTED;
        this.executedAt = Instant.now();
    }

    public boolean isNormalNotice() {
        return type == TenancyExitRequestType.NORMAL_NOTICE;
    }

    public boolean isPremature() {
        return type == TenancyExitRequestType.PREMATURE;
    }

    private void ensureRequested() {
        if (status != TenancyExitRequestStatus.REQUESTED) {
            throw new ValidationException("Exit request is not pending review");
        }
    }

    private static void validateNonNegative(Long amount, String message) {
        if (amount != null && amount < 0) {
            throw new ValidationException(message);
        }
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
