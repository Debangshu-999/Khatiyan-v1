package com.khatiyan.d_modules.concerns;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ReopenConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ResolveConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.UpdateConcernStatusRequest;
import com.khatiyan.d_modules.concerns.service.ConcernService;

/**
 * Public facade for the concerns module.
 *
 * <p>Other modules should depend on this facade instead of importing concern
 * services, repositories, or entities directly. It exposes stable concern
 * lifecycle operations while keeping the module internals free to evolve.
 */
@Component
public class ConcernModule {

    private final ConcernService concernService;

    public ConcernModule(ConcernService concernService) {
        this.concernService = concernService;
    }

    public ConcernResponse raiseConcern(UUID tenantUserId, CreateConcernRequest request) {
        return concernService.raiseConcern(tenantUserId, request);
    }

    public List<ConcernResponse> listTenantCurrentConcerns(UUID tenantUserId) {
        return concernService.listTenantCurrentConcerns(tenantUserId);
    }

    public List<ConcernResponse> listTenantConcernHistory(UUID tenantUserId) {
        return concernService.listTenantConcernHistory(tenantUserId);
    }

    public List<ConcernResponse> listAvailableConcerns(UUID actorUserId, UUID propertyId) {
        return concernService.listAvailableConcerns(actorUserId, propertyId);
    }

    public List<ConcernResponse> listUndertakenConcerns(UUID actorUserId) {
        return concernService.listUndertakenConcerns(actorUserId);
    }

    public List<ConcernResponse> listPropertyConcernHistory(UUID actorUserId, UUID propertyId) {
        return concernService.listPropertyConcernHistory(actorUserId, propertyId);
    }

    public List<ConcernResponse> listEscalatedConcerns(UUID actorUserId, UUID propertyId) {
        return concernService.listEscalatedConcerns(actorUserId, propertyId);
    }

    public ConcernResponse assignConcern(UUID actorUserId, UUID concernId, AssignConcernRequest request) {
        return concernService.assignConcern(actorUserId, concernId, request);
    }

    public ConcernResponse updateConcernStatus(UUID actorUserId, UUID concernId, UpdateConcernStatusRequest request) {
        return concernService.updateConcernStatus(actorUserId, concernId, request);
    }

    public ConcernResponse resolveConcern(UUID actorUserId, UUID concernId, ResolveConcernRequest request) {
        return concernService.resolveConcern(actorUserId, concernId, request);
    }

    public ConcernResponse reopenConcern(UUID tenantUserId, UUID concernId, ReopenConcernRequest request) {
        return concernService.reopenConcern(tenantUserId, concernId, request);
    }

    public int closeExpiredResolvedConcerns() {
        return concernService.closeExpiredResolvedConcerns();
    }

    public List<ConcernResponse> findOpenUnassignedCreatedBefore(Instant createdBefore) {
        return concernService.findOpenUnassignedCreatedBefore(createdBefore);
    }

    public int updateConcernEscalationLevels() {
        return concernService.updateConcernEscalationLevels();
    }
}
