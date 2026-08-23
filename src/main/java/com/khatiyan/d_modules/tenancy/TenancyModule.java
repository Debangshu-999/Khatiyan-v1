package com.khatiyan.d_modules.tenancy;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.service.TenancyExitRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyRoomChangeRequestService;
import com.khatiyan.d_modules.tenancy.service.TenancyService;

/**
 * Public facade for the tenancy module.
 *
 * <p>In this modular monolith, other modules should depend on this
 * class instead of importing tenancy services, repositories, or the
 * {@code Tenancy} entity directly. The facade exposes stable DTOs and
 * module-level questions such as "is this user currently a tenant of
 * this property?", while keeping tenancy internals free to evolve.
 */
@Component
public class TenancyModule {

    private final TenancyService tenancyService;
    private final TenancyExitRequestService tenancyExitRequestService;
    private final TenancyRoomChangeRequestService tenancyRoomChangeRequestService;

    // TenancyExitRequestService / TenancyRoomChangeRequestService transitively
    // depend on BillingModule, which depends back on TenancyModule
    // (BillingCycleService needs tenancy reads). @Lazy defers these edges so the
    // bean-init graph stays acyclic; the proxies resolve on first use, by which
    // point all beans exist.
    public TenancyModule(
            TenancyService tenancyService,
            @Lazy TenancyExitRequestService tenancyExitRequestService,
            @Lazy TenancyRoomChangeRequestService tenancyRoomChangeRequestService) {
        this.tenancyService = tenancyService;
        this.tenancyExitRequestService = tenancyExitRequestService;
        this.tenancyRoomChangeRequestService = tenancyRoomChangeRequestService;
    }

    public Optional<TenancyResponse> findById(UUID tenancyId) {
        return tenancyService.findById(tenancyId)
            .map(tenancy -> TenancyResponse.from(tenancy));
    }

    public Map<UUID, TenancyResponse> findByIds(Collection<UUID> tenancyIds) {
        return tenancyService.findByIds(tenancyIds);
    }

    public Optional<TenancyResponse> findActiveByUserId(UUID userId) {
        return tenancyService.findActiveByUserId(userId)
            .map(tenancy -> TenancyResponse.from(tenancy));
    }

    public List<TenancyResponse> findActiveByPropertyId(UUID propertyId) {
        return tenancyService.findActiveByPropertyId(propertyId).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    public List<TenancyResponse> findInactiveByPropertyId(UUID propertyId) {
        return tenancyService.findInactiveByPropertyId(propertyId).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    public List<TenancyResponse> findActiveBillingStartedMonthlyTenancies() {
        return tenancyService.findActiveBillingStartedMonthlyTenancies().stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    public List<TenancyResponse> findActiveEndingBetween(LocalDate startDate, LocalDate endDate) {
        return tenancyService.findActiveEndingBetween(startDate, endDate).stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
    }

    /**
     * Exit requests for a property the actor manages. Used by the owner action
     * center to derive pending / upcoming / ending-today exit counts.
     */
    public List<TenancyExitRequestResponse> listPropertyExitRequests(UUID actorUserId, UUID propertyId) {
        return tenancyExitRequestService.listForProperty(actorUserId, propertyId);
    }

    /**
     * Room-change requests for a property the actor manages. Used by the owner
     * action center to derive the pending room-change count.
     */
    public List<TenancyRoomChangeRequestResponse> listPropertyRoomChangeRequests(UUID actorUserId, UUID propertyId) {
        return tenancyRoomChangeRequestService.listForProperty(actorUserId, propertyId);
    }

    public boolean isUserTenantOfProperty(UUID userId, UUID propertyId) {
        return tenancyService.isUserTenantOfProperty(userId, propertyId);
    }

    public boolean hasActiveTenancyForRoom(UUID roomId) {
        return tenancyService.hasActiveTenancyForRoom(roomId);
    }

    public long countActiveTenanciesForRoom(UUID roomId) {
        return tenancyService.countActiveTenanciesForRoom(roomId);
    }

    public void markBillingStarted(UUID tenancyId) {
        tenancyService.markBillingStarted(tenancyId);
    }

    // ---- Agreement (compliance) lifecycle -------------------------------
    // Compliance orchestrates agreement-gated onboarding through these; the
    // tenancy module stays ignorant of agreements themselves.

    /**
     * Onboards a monthly tenancy held as {@code PENDING_ACCEPTANCE}: bed
     * reserved, user not yet an active tenant, billing deferred to acceptance.
     */
    public TenancyOnboardingResponse onboardPendingMonthly(
            UUID actorUserId,
            String tenantPhone,
            String tenantName,
            UUID propertyId,
            UUID roomId,
            Long rentAmountPaise,
            Long depositAmountPaise,
            LocalDate startDate,
            boolean idCheckConfirmed) {
        return tenancyService.onboardPending(
                actorUserId, tenantPhone, tenantName, propertyId, roomId,
                rentAmountPaise, depositAmountPaise, startDate, idCheckConfirmed);
    }

    /** Activates a pending tenancy after the tenant accepted the agreement. */
    public TenancyResponse acceptTermsAndActivate(UUID tenancyId, UUID tenantUserId) {
        return TenancyResponse.from(tenancyService.acceptTermsAndActivate(tenancyId, tenantUserId));
    }

    /**
     * Stamps the accepted agreement's lock-in / early-exit terms onto the
     * tenancy. Penalty type is a String so compliance stays clear of the tenancy
     * model enum.
     */
    /**
     * Stamps the accepted agreement's terms onto the tenancy.
     *
     * <p>Null {@code validityMonths} means indefinite; a value gives the fixed
     * term whose end date the tenancy derives and carries from day one.
     */
    public void stampAgreementTerms(UUID tenancyId, Integer validityMonths, String earlyExitRule) {
        tenancyService.stampAgreementTerms(tenancyId, validityMonths, earlyExitRule);
    }

    /** Cancels a pending tenancy because the tenant declined the agreement. */
    public void declinePendingTenancy(UUID tenancyId, UUID tenantUserId, String reason) {
        tenancyService.cancelPendingAsTenant(tenancyId, tenantUserId, reason);
    }

    /** Cancels a pending tenancy whose acceptance window expired. */
    public void cancelPendingTenancyBySystem(UUID tenancyId, String reason) {
        tenancyService.cancelPendingAsSystem(tenancyId, reason);
    }

    /** Owner/manager withdraws a tenancy the tenant never accepted. */
    public void cancelPendingTenancyByManager(UUID actorUserId, UUID tenancyId, String reason) {
        tenancyService.cancelPendingAsManager(actorUserId, tenancyId, reason);
    }
}
