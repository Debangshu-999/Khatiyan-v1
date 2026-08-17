package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;

/**
 * API representation of a tenancy exit request.
 *
 * <p>Carries enough history for the client to render a request chain as one
 * stacked card rather than several unrelated-looking ones:
 * {@code supersededRequestId} links a re-raise back to the request it replaces,
 * and the withdrawal timestamps place that step on the same timeline.
 */
public record TenancyExitRequestResponse(
    UUID id,
    /** The short code shown to both sides. Quote this, never the UUID. */
    String referenceCode,
    UUID tenancyId,
    UUID tenantUserId,
    /**
     * Who this is about. Resolved at read time rather than snapshotted: a
     * request is reviewed within days of being raised, so there is no drift
     * worth denormalising against, and a stale name on a live decision is worse
     * than none.
     */
    String tenantName,
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
    /** Who approved or rejected it — accountability for the decision. */
    String decidedByName,
    Instant decidedAt,
    Instant executedAt,
    /** The date the notice period counts from; inherited on a re-raise. */
    LocalDate noticeAnchorDate,
    /** The expired or rejected request this one re-raises, if any. */
    UUID supersededRequestId,
    Instant withdrawalRequestedAt,
    String withdrawalReason,
    Instant withdrawalDecidedAt,
    UUID withdrawalDecidedByUserId,
    String withdrawalDecidedByName,
    String withdrawalAdminNotes,
    /**
     * Whether the tenant may still ask to undo this approved exit. Computed
     * server-side because it depends on the current time, which the client
     * should not be deciding for itself.
     */
    boolean withdrawalWindowOpen,
    /**
     * When this stops being interactive and drops into history. Null means an
     * open-ended wait (a withdrawal awaiting the owner).
     */
    Instant expiresAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static TenancyExitRequestResponse from(TenancyExitRequest request) {
        return from(request, LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")), Map.of());
    }

    public static TenancyExitRequestResponse from(TenancyExitRequest request, LocalDate today) {
        return from(request, today, Map.of());
    }

    /**
     * @param names user id to display name, for whichever of the tenant and the
     *              deciders the caller resolved. Missing ids simply render null.
     */
    public static TenancyExitRequestResponse from(
            TenancyExitRequest request,
            LocalDate today,
            Map<UUID, String> names) {
        return new TenancyExitRequestResponse(
            request.getId(),
            request.getReferenceCode(),
            request.getTenancyId(),
            request.getTenantUserId(),
            nameOf(names, request.getTenantUserId()),
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
            nameOf(names, request.getDecidedByUserId()),
            request.getDecidedAt(),
            request.getExecutedAt(),
            request.getNoticeAnchorDate(),
            request.getSupersededRequestId(),
            request.getWithdrawalRequestedAt(),
            request.getWithdrawalReason(),
            request.getWithdrawalDecidedAt(),
            request.getWithdrawalDecidedByUserId(),
            nameOf(names, request.getWithdrawalDecidedByUserId()),
            request.getWithdrawalAdminNotes(),
            request.withdrawalWindowOpen(today),
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
