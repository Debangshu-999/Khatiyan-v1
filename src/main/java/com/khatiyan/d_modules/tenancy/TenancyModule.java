package com.khatiyan.d_modules.tenancy;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
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

    public TenancyModule(TenancyService tenancyService) {
        this.tenancyService = tenancyService;
    }

    public Optional<TenancyResponse> findById(UUID tenancyId) {
        return tenancyService.findById(tenancyId)
            .map(tenancy -> TenancyResponse.from(tenancy));
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

    public List<TenancyResponse> findActiveBillingStartedMonthlyTenancies() {
        return tenancyService.findActiveBillingStartedMonthlyTenancies().stream()
            .map(tenancy -> TenancyResponse.from(tenancy))
            .toList();
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
}
