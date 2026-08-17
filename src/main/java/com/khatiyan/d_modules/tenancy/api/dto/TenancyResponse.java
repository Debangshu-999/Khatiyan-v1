package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

/**
 * Public-facing tenancy DTO. Used both by the REST controller
 * and by the {@link com.khatiyan.tenancy.TenancyModule} facade
 * when other modules ask for tenancy data.
 */
public record TenancyResponse(
    UUID id,
    String referenceCode,
    UUID userId,
    String tenantName,
    String tenantPhone,
    boolean tenantPhoneVerified,
    boolean tenantProfileCompleted,
    UUID propertyId,
    UUID roomId,
    UUID createdByUserId,
    TenancyBillingType billingType,
    Long rentAmountPaise,
    Long depositAmountPaise,
    Long dailyRatePaise,
    LocalDate startDate,
    LocalDate plannedEndDate,
    LocalDate endDate,
    TenancyStatus status,
    Instant createdAt,
    boolean billingStarted,
    boolean tosAccepted,
    /** True when the agreement runs for a fixed term rather than indefinitely. */
    boolean fixedTerm,
    /** The day a fixed term — and the tenancy — ends. Null when indefinite. */
    LocalDate agreementEndDate,
    /** What leaving early costs, in the owner's words. Applied by a person. */
    String earlyExitRule,
    // The owner's own declaration that they checked the tenant's ID proof and
    // photograph. Null on tenancies onboarded before it was required.
    Boolean idCheckConfirmed,
    Instant idCheckedAt
) {
    public static TenancyResponse from(Tenancy t) {
        return new TenancyResponse(
            t.getId(),
            t.getReferenceCode(),
            t.getUserId(),
            null,
            null,
            false,
            false,
            t.getPropertyId(),
            t.getRoomId(),
            t.getCreatedByUserId(),
            t.getBillingType(),
            t.getRentAmountPaise(),
            t.getDepositAmountPaise(),
            t.getDailyRatePaise(),
            t.getStartDate(),
            t.getPlannedEndDate(),
            t.getEndDate(),
            t.getStatus(),
            t.getCreatedAt(),
            t.isBillingStarted(),
            t.isTosAccepted(),
            t.hasFixedTerm(),
            t.getAgreementEndDate(),
            t.getEarlyExitRule(),
            t.getIdCheckConfirmed(),
            t.getIdCheckedAt()
        );
    }

    public static TenancyResponse from(Tenancy t, UserSummaryResponse user) {
        return new TenancyResponse(
            t.getId(),
            t.getReferenceCode(),
            t.getUserId(),
            user != null ? user.fullName() : null,
            user != null ? user.phone() : null,
            user != null && user.phoneVerified(),
            user != null && user.profileCompleted(),
            t.getPropertyId(),
            t.getRoomId(),
            t.getCreatedByUserId(),
            t.getBillingType(),
            t.getRentAmountPaise(),
            t.getDepositAmountPaise(),
            t.getDailyRatePaise(),
            t.getStartDate(),
            t.getPlannedEndDate(),
            t.getEndDate(),
            t.getStatus(),
            t.getCreatedAt(),
            t.isBillingStarted(),
            t.isTosAccepted(),
            t.hasFixedTerm(),
            t.getAgreementEndDate(),
            t.getEarlyExitRule(),
            t.getIdCheckConfirmed(),
            t.getIdCheckedAt()
        );
    }
}
