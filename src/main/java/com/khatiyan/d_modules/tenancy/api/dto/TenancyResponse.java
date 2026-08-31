package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.Gender;
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
    /** The tenant's account. Null on a guest-recorded daily stay. */
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
    /**
     * The term's length in months. Null when indefinite.
     *
     * <p>Exposed alongside the end date because the deed states the term both
     * ways — "for a period of 11 months" and "to July 28, 2027" — and deriving
     * the count back from two dates gets month lengths wrong.
     */
    Integer agreementValidityMonths,
    /** The day a fixed term — and the tenancy — ends. Null when indefinite. */
    LocalDate agreementEndDate,
    /** What leaving early costs, in the owner's words. Applied by a person. */
    String earlyExitRule,
    // The owner's own declaration that they checked the tenant's ID proof and
    // photograph. Null on tenancies onboarded before it was required.
    Boolean idCheckConfirmed,
    Instant idCheckedAt,
    /**
     * A daily stay recorded against a guest register rather than an account.
     *
     * <p>Clients read this rather than testing {@code userId} for null, because
     * what it changes is behaviour and not just a missing value: there is
     * nobody to notify, nobody to message, and no tenant-side view of the stay.
     */
    boolean guestStay,
    /** Optional even on a guest stay — a walk-in often has no reason to give one. */
    String guestEmail,
    String guestAddress,
    /** Stated at check-in and never recomputed. See {@code GuestDetails}. */
    Integer guestAge,
    Gender guestGender
) {
    public static TenancyResponse from(Tenancy t) {
        return new TenancyResponse(
            t.getId(),
            t.getReferenceCode(),
            t.getUserId(),
            // A guest stay's name and phone live on the row, so they fill the
            // same two fields an account would have supplied. Every existing
            // reader that shows "who is this tenancy for" keeps working.
            t.guestDisplayName(),
            t.getGuestPhone(),
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
            t.getAgreementValidityMonths(),
            t.getAgreementEndDate(),
            t.getEarlyExitRule(),
            t.getIdCheckConfirmed(),
            t.getIdCheckedAt(),
            t.isGuestStay(),
            t.getGuestEmail(),
            t.getGuestAddress(),
            t.getGuestAge(),
            t.getGuestGender()
        );
    }

    public static TenancyResponse from(Tenancy t, UserSummaryResponse user) {
        return new TenancyResponse(
            t.getId(),
            t.getReferenceCode(),
            t.getUserId(),
            user != null ? user.fullName() : t.guestDisplayName(),
            user != null ? user.phone() : t.getGuestPhone(),
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
            t.getAgreementValidityMonths(),
            t.getAgreementEndDate(),
            t.getEarlyExitRule(),
            t.getIdCheckConfirmed(),
            t.getIdCheckedAt(),
            t.isGuestStay(),
            t.getGuestEmail(),
            t.getGuestAddress(),
            t.getGuestAge(),
            t.getGuestGender()
        );
    }
}
