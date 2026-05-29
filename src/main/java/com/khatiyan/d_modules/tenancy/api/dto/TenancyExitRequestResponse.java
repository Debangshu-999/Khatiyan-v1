package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * API representation of a tenancy exit request.
 */
public record TenancyExitRequestResponse(
    UUID id,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    UUID roomId,
    TenancyExitRequestType type,
    TenancyExitRequestStatus status,
    LocalDate requestedCheckoutDate,
    LocalDate approvedCheckoutDate,
    String tenantReason,
    String adminNotes,
    Long finalBillingAmountPaise,
    Boolean depositPayable,
    Long depositSettlementAmountPaise,
    UUID decidedByUserId,
    Instant decidedAt,
    Instant executedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static TenancyExitRequestResponse from(TenancyExitRequest request) {
        return new TenancyExitRequestResponse(
            request.getId(),
            request.getTenancyId(),
            request.getTenantUserId(),
            request.getPropertyId(),
            request.getRoomId(),
            request.getType(),
            request.getStatus(),
            request.getRequestedCheckoutDate(),
            request.getApprovedCheckoutDate(),
            request.getTenantReason(),
            request.getAdminNotes(),
            request.getFinalBillingAmountPaise(),
            request.getDepositPayable(),
            request.getDepositSettlementAmountPaise(),
            request.getDecidedByUserId(),
            request.getDecidedAt(),
            request.getExecutedAt(),
            request.getCreatedAt(),
            request.getUpdatedAt()
        );
    }
}
