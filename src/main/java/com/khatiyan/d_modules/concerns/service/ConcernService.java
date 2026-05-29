package com.khatiyan.d_modules.concerns.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernPhotoRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ReopenConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ResolveConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.UpdateConcernStatusRequest;
import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernReopenedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernResolvedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernStatusChangedEvent;
import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.repository.ConcernRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for tenant concerns.
 *
 * <p>This service owns concern creation, admin work queues, tenant history,
 * and lifecycle transitions such as undertaking, resolving, reopening, and
 * closing concerns after the reopen window expires.
 */
@Slf4j
@Service
public class ConcernService {

    private final ConcernRepository concernRepository;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final ApplicationEventPublisher eventPublisher;

    public ConcernService(
            ConcernRepository concernRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ApplicationEventPublisher eventPublisher) {
        this.concernRepository = concernRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.eventPublisher = eventPublisher;
    }

    private Concern getConcern(UUID concernId) {
        return concernRepository.findConcernById(concernId)
                .orElseThrow(() -> new NotFoundException("Concern_", concernId));
    }

    private void ensureTenantRaisedConcern(UUID tenantUserId, Concern concern) {
        if (!concern.getRaisedByUserId().equals(tenantUserId)) {
            throw new ValidationException("Concern does not belong to this tenant");
        }
    }

    private ConcernResponse toResponse(Concern concern) {
        return ConcernResponse.from(concern);
    }

    /**
     * Creates a concern for the tenant's current active tenancy.
     */
    @Transactional
    public ConcernResponse raiseConcern(UUID tenantUserId, CreateConcernRequest request) {
        TenancyResponse activeTenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));

        Concern concern = Concern.raise(
                activeTenancy.propertyId(),
                activeTenancy.roomId(),
                activeTenancy.id(),
                tenantUserId,
                request.category(),
                request.priority(),
                request.title().trim(),
                request.description().trim());

        if (request.photos() != null) {
            for (ConcernPhotoRequest photo : request.photos()) {
                concern.addPhoto(photo.photoUrl().trim(), photo.photoPublicId());
            }
        }

        Concern saved = concernRepository.save(concern);

        log.info(
                "Concern raised concernId={} tenantUserId={} propertyId={} roomId={} category={} priority={}",
                saved.getId(),
                tenantUserId,
                saved.getPropertyId(),
                saved.getRoomId(),
                saved.getCategory(),
                saved.getPriority());

        eventPublisher.publishEvent(new ConcernRaisedEvent(
                saved.getId(),
                saved.getPropertyId(),
                saved.getRaisedByUserId(),
                saved.getTitle()));

        return toResponse(saved);
    }

    /**
     * Lists non-closed concerns raised by the authenticated tenant.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listTenantCurrentConcerns(UUID tenantUserId) {
        return concernRepository.findCurrentByRaisedByUserId(tenantUserId)
                .stream()
                .map(concern -> toResponse(concern))
                .toList();
    }

    /**
     * Lists closed concerns raised by the authenticated tenant.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listTenantConcernHistory(UUID tenantUserId) {
        return concernRepository.findHistoryByRaisedByUserId(tenantUserId)
                .stream()
                .map(concern -> toResponse(concern))
                .toList();
    }

    /**
     * Lists open concerns for a property managed by the actor.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listAvailableConcerns(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return concernRepository.findOpenByPropertyId(propertyId)
                .stream()
                .map(concern -> toResponse(concern))
                .toList();
    }

    /**
     * Lists in-progress concerns currently undertaken by the actor.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listUndertakenConcerns(UUID actorUserId) {
        return concernRepository.findInProgressByAssignedToUserId(actorUserId)
                .stream()
                .map(concern -> toResponse(concern))
                .toList();
    }

    /**
     * Lists resolved and closed concern history for a property managed by the actor.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listPropertyConcernHistory(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return concernRepository.findHistoryByPropertyId(propertyId)
                .stream()
                .map(concern -> toResponse(concern))
                .toList();
    }

    /**
     * Assigns a concern to an owner or manager who can manage its property.
     */
    @Transactional
    public ConcernResponse assignConcern(UUID actorUserId, UUID concernId, AssignConcernRequest request) {
        Concern concern = getConcern(concernId);
        propertyModule.ensureCanManageProperty(actorUserId, concern.getPropertyId());
        propertyModule.ensureCanManageProperty(request.assignedToUserId(), concern.getPropertyId());

        try {
            concern.assignTo(request.assignedToUserId());
        } catch (IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        log.info(
                "Concern assigned concernId={} propertyId={} assignedToUserId={} actorUserId={}",
                concern.getId(),
                concern.getPropertyId(),
                concern.getAssignedToUserId(),
                actorUserId);

        eventPublisher.publishEvent(new ConcernAssignedEvent(
                concern.getId(),
                concern.getPropertyId(),
                concern.getAssignedToUserId(),
                concern.getTitle()));

        return toResponse(concern);
    }

    /**
     * Moves a concern between active states. Marking in progress auto-assigns it
     * to the actor.
     */
    @Transactional
    public ConcernResponse updateConcernStatus(UUID actorUserId, UUID concernId, UpdateConcernStatusRequest request) {
        Concern concern = getConcern(concernId);
        propertyModule.ensureCanManageProperty(actorUserId, concern.getPropertyId());

        try {
            switch (request.status()) {
                case OPEN -> concern.markOpen();
                case IN_PROGRESS -> concern.markInProgress(actorUserId);
                default -> throw new ValidationException("Use resolve or close-expired flow for this concern status");
            }
        } catch (IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        log.info(
                "Concern status updated concernId={} propertyId={} actorUserId={} status={}",
                concern.getId(),
                concern.getPropertyId(),
                actorUserId,
                concern.getStatus());

        eventPublisher.publishEvent(new ConcernStatusChangedEvent(
                concern.getId(),
                concern.getPropertyId(),
                concern.getRaisedByUserId(),
                concern.getAssignedToUserId(),
                concern.getStatus(),
                concern.getTitle()));

        return toResponse(concern);
    }

    /**
     * Marks a concern resolved and starts the three-day tenant reopen window.
     */
    @Transactional
    public ConcernResponse resolveConcern(UUID actorUserId, UUID concernId, ResolveConcernRequest request) {
        Concern concern = getConcern(concernId);
        propertyModule.ensureCanManageProperty(actorUserId, concern.getPropertyId());

        try {
            concern.resolve(actorUserId, request.resolutionNote().trim(), Instant.now());
        } catch (IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        log.info(
                "Concern resolved concernId={} propertyId={} actorUserId={} reopenUntil={}",
                concern.getId(),
                concern.getPropertyId(),
                actorUserId,
                concern.getReopenUntil());

        eventPublisher.publishEvent(new ConcernResolvedEvent(
                concern.getId(),
                concern.getPropertyId(),
                concern.getRaisedByUserId(),
                concern.getResolvedByUserId(),
                concern.getTitle()));

        return toResponse(concern);
    }

    /**
     * Reopens a tenant's resolved concern within the reopen window.
     */
    @Transactional
    public ConcernResponse reopenConcern(UUID tenantUserId, UUID concernId, ReopenConcernRequest request) {
        Concern concern = getConcern(concernId);
        ensureTenantRaisedConcern(tenantUserId, concern);

        try {
            concern.reopen(request.reopenReason().trim(), Instant.now());
        } catch (IllegalStateException e) {
            throw new ValidationException(e.getMessage());
        }

        log.info(
                "Concern reopened concernId={} tenantUserId={} assignedToUserId={}",
                concern.getId(),
                tenantUserId,
                concern.getAssignedToUserId());

        eventPublisher.publishEvent(new ConcernReopenedEvent(
                concern.getId(),
                concern.getPropertyId(),
                concern.getRaisedByUserId(),
                concern.getAssignedToUserId(),
                concern.getTitle()));

        return toResponse(concern);
    }

    /**
     * Closes resolved concerns whose reopen window has expired.
     */
    @Transactional
    public int closeExpiredResolvedConcerns() {
        Instant now = Instant.now();
        List<Concern> concerns = concernRepository.findResolvedConcernsPastReopenWindow(now);

        for (Concern concern : concerns) {
            concern.closeAfterReopenWindow(now);
        }

        if (!concerns.isEmpty()) {
            log.info("Expired resolved concerns closed count={}", concerns.size());
        }

        return concerns.size();
    }
}
