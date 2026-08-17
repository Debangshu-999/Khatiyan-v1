package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;

public record TenancyRoomChangeRequestResponse(
    UUID id,
    /** The short code shown to both sides. Quote this, never the UUID. */
    String referenceCode,
    UUID tenancyId,
    UUID tenantUserId,
    /** Who this is about. Resolved at read time, like the exit request. */
    String tenantName,
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
    /** Who approved or rejected it. */
    String decidedByName,
    Instant decidedAt,
    Instant executedAt,
    /**
     * When this stops being interactive and drops into history. Null means an
     * open-ended wait (a withdrawal awaiting the owner).
     */
    Instant expiresAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static TenancyRoomChangeRequestResponse from(TenancyRoomChangeRequest request) {
        return from(request, Map.of());
    }

    /**
     * @param names user id to display name for whoever the caller resolved
     */
    public static TenancyRoomChangeRequestResponse from(
            TenancyRoomChangeRequest request,
            Map<UUID, String> names) {
        return new TenancyRoomChangeRequestResponse(
            request.getId(),
            request.getReferenceCode(),
            request.getTenancyId(),
            request.getTenantUserId(),
            nameOf(names, request.getTenantUserId()),
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
            nameOf(names, request.getDecidedByUserId()),
            request.getDecidedAt(),
            request.getExecutedAt(),
            request.getExpiresAt(),
            request.getCreatedAt(),
            request.getUpdatedAt()
        );
    }

    /**
     * Null-safe name lookup.
     *
     * <p>{@code Map.of()} throws on a null key, and a decider id is null on every
     * request nobody has decided yet — which is most of them.
     */
    private static String nameOf(Map<UUID, String> names, UUID userId) {
        return userId == null ? null : names.get(userId);
    }
}
