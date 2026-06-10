package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;

public record TenancyRoomChangeRequestResponse(
    UUID id,
    UUID tenancyId,
    UUID tenantUserId,
    UUID propertyId,
    UUID currentRoomId,
    UUID targetRoomId,
    UUID billingCycleId,
    TenancyRoomChangeRequestStatus status,
    LocalDate effectiveTransferDate,
    String tenantReason,
    String adminNotes,
    long requestedRoomRentAmountPaise,
    Long executedRentAmountPaise,
    UUID decidedByUserId,
    Instant decidedAt,
    Instant executedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static TenancyRoomChangeRequestResponse from(TenancyRoomChangeRequest request) {
        return new TenancyRoomChangeRequestResponse(
            request.getId(),
            request.getTenancyId(),
            request.getTenantUserId(),
            request.getPropertyId(),
            request.getCurrentRoomId(),
            request.getTargetRoomId(),
            request.getBillingCycleId(),
            request.getStatus(),
            request.getEffectiveTransferDate(),
            request.getTenantReason(),
            request.getAdminNotes(),
            request.getRequestedRoomRentAmountPaise(),
            request.getExecutedRentAmountPaise(),
            request.getDecidedByUserId(),
            request.getDecidedAt(),
            request.getExecutedAt(),
            request.getCreatedAt(),
            request.getUpdatedAt()
        );
    }
}
