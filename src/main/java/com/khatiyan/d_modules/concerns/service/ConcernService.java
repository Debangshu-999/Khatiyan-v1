package com.khatiyan.d_modules.concerns.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.concerns.api.dto.AssignConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernDashboardSummary;
import com.khatiyan.d_modules.concerns.api.dto.ConcernPhotoRequest;
import com.khatiyan.d_modules.concerns.api.dto.ConcernResponse;
import com.khatiyan.d_modules.concerns.api.dto.CreateConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ReopenConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.ResolveConcernRequest;
import com.khatiyan.d_modules.concerns.api.dto.UpdateConcernStatusRequest;
import com.khatiyan.d_modules.concerns.event.ConcernAssignedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernEscalatedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernRaisedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernReopenedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernResolvedEvent;
import com.khatiyan.d_modules.concerns.event.ConcernStatusChangedEvent;
import com.khatiyan.d_modules.concerns.model.Concern;
import com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel;
import com.khatiyan.d_modules.concerns.repository.ConcernRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
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
    private final ConcernAccessPolicy concernAccessPolicy;
    private final AuthModule authModule;
    private final ApplicationEventPublisher eventPublisher;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private static final int MAX_WEEKLY_CONCERNS_PER_TENANT = 5;

    public ConcernService(
            ConcernRepository concernRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ConcernAccessPolicy concernAccessPolicy,
            AuthModule authModule,
            ApplicationEventPublisher eventPublisher,
            ReferenceCodeGenerator referenceCodeGenerator) {
        this.concernRepository = concernRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.concernAccessPolicy = concernAccessPolicy;
        this.authModule = authModule;
        this.eventPublisher = eventPublisher;
        this.referenceCodeGenerator = referenceCodeGenerator;
    }

    private Concern getConcern(UUID concernId) {
        return concernRepository.findConcernById(concernId)
                .orElseThrow(() -> new NotFoundException("Concern", concernId));
    }

    private void ensureTenantRaisedConcern(UUID tenantUserId, Concern concern) {
        if (!concern.getRaisedByUserId().equals(tenantUserId)) {
            throw new ValidationException("Concern does not belong to this tenant");
        }
    }

    private ConcernResponse toResponse(Concern concern) {
        return ConcernResponse.from(
                concern,
                roomNumberFor(concern),
                tenancyReferenceCodeFor(concern),
                userNameFor(concern.getAssignedToUserId()),
                userNameFor(concern.getAssignedByUserId()));
    }

    private List<ConcernResponse> toResponses(List<Concern> concerns) {
        if (concerns.isEmpty()) {
            return List.of();
        }

        Map<UUID, String> tenancyReferenceCodes = tenancyModule.findByIds(concerns.stream()
                        .map(Concern::getTenancyId)
                        .collect(Collectors.toSet()))
                .entrySet()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().referenceCode()));

        Map<UUID, Set<UUID>> roomIdsByProperty = concerns.stream()
                .collect(Collectors.groupingBy(
                        Concern::getPropertyId,
                        Collectors.mapping(Concern::getRoomId, Collectors.toSet())));
        Map<RoomDisplayKey, String> roomNumbers = new HashMap<>();
        roomIdsByProperty.forEach((propertyId, roomIds) -> propertyModule.findRoomsForDisplay(propertyId, roomIds)
                .forEach((roomId, room) -> roomNumbers.put(new RoomDisplayKey(propertyId, roomId), room.roomNumber())));

        Set<UUID> userIds = new HashSet<>();
        concerns.forEach(concern -> {
            if (concern.getAssignedToUserId() != null) {
                userIds.add(concern.getAssignedToUserId());
            }
            if (concern.getAssignedByUserId() != null) {
                userIds.add(concern.getAssignedByUserId());
            }
        });
        Map<UUID, String> userNames = authModule.findByIds(userIds)
                .entrySet()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> displayUserName(entry.getValue())));

        return concerns.stream()
                .map(concern -> ConcernResponse.from(
                        concern,
                        roomNumbers.getOrDefault(
                                new RoomDisplayKey(concern.getPropertyId(), concern.getRoomId()), "Unavailable"),
                        tenancyReferenceCodes.getOrDefault(concern.getTenancyId(), "Unavailable"),
                        userNameFor(concern.getAssignedToUserId(), userNames),
                        userNameFor(concern.getAssignedByUserId(), userNames)))
                .toList();
    }

    private String roomNumberFor(Concern concern) {
        return propertyModule.findRoomForDisplay(concern.getPropertyId(), concern.getRoomId())
                .map(room -> room.roomNumber())
                .orElse("Unavailable");
    }

    private String tenancyReferenceCodeFor(Concern concern) {
        return tenancyModule.findById(concern.getTenancyId())
                .map(tenancy -> tenancy.referenceCode())
                .orElse("Unavailable");
    }

    private String userNameFor(UUID userId) {
        if (userId == null) {
            return null;
        }

        return authModule.findById(userId)
                .map(this::displayUserName)
                .orElse("Unknown");
    }

    private String userNameFor(UUID userId, Map<UUID, String> userNames) {
        if (userId == null) {
            return null;
        }
        return userNames.getOrDefault(userId, "Unknown");
    }

    private String displayUserName(UserSummaryResponse user) {
        if (user.fullName() != null && !user.fullName().isBlank()) {
            return user.fullName();
        }
        return "Unknown";
    }

    private record RoomDisplayKey(UUID propertyId, UUID roomId) {
    }

    private void ensurePropertyOwner(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        if (!property.ownerId().equals(actorUserId)) {
            throw new ForbiddenException("Only the property owner can monitor concerns");
        }
    }

    /**
     * Creates a concern for the tenant's current active tenancy.
     */
    @Transactional
    public ConcernResponse raiseConcern(UUID tenantUserId, CreateConcernRequest request) {
        TenancyResponse activeTenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));
        enforceWeeklyRaiseLimit(tenantUserId);

        Concern concern = Concern.raise(
                referenceCodeGenerator.nextCode("CON"),
                activeTenancy.propertyId(),
                activeTenancy.roomId(),
                activeTenancy.id(),
                tenantUserId,
                request.category(),
                request.title().trim(),
                request.description().trim());

        if (request.photos() != null) {
            for (ConcernPhotoRequest photo : request.photos()) {
                concern.addPhoto(photo.photoUrl().trim(), photo.photoPublicId());
            }
        }

        Concern saved = concernRepository.save(concern);

        log.info(
                "Concern raised concernId={} tenantUserId={} propertyId={} roomId={} category={}",
                saved.getId(),
                tenantUserId,
                saved.getPropertyId(),
                saved.getRoomId(),
                saved.getCategory());

        eventPublisher.publishEvent(new ConcernRaisedEvent(
                saved.getId(),
                saved.getPropertyId(),
                saved.getRaisedByUserId(),
                saved.getTitle()));

        return toResponse(saved);
    }

    private void enforceWeeklyRaiseLimit(UUID tenantUserId) {
        Instant windowStart = Instant.now().minus(7, ChronoUnit.DAYS);
        long concernCount = concernRepository.countRaisedByUserIdSince(tenantUserId, windowStart);
        if (concernCount >= MAX_WEEKLY_CONCERNS_PER_TENANT) {
            throw new ValidationException("You can raise up to 5 concerns in a 7 day period.");
        }
    }

    /**
     * Lists non-closed concerns raised by the authenticated tenant.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listTenantCurrentConcerns(UUID tenantUserId) {
        List<Concern> concerns = tenancyModule.findActiveByUserId(tenantUserId)
                .map(activeTenancy -> concernRepository.findCurrentByRaisedByUserIdAndPropertyId(
                        tenantUserId,
                        activeTenancy.propertyId()))
                .orElseGet(() -> concernRepository.findCurrentByRaisedByUserId(tenantUserId));

        return toResponses(concerns);
    }

    /**
     * Lists closed concerns raised by the authenticated tenant.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listTenantConcernHistory(UUID tenantUserId) {
        List<Concern> concerns = tenancyModule.findActiveByUserId(tenantUserId)
                .map(activeTenancy -> concernRepository.findHistoryByRaisedByUserIdAndPropertyId(
                        tenantUserId,
                        activeTenancy.propertyId()))
                .orElseGet(() -> concernRepository.findHistoryByRaisedByUserId(tenantUserId));

        return toResponses(concerns);
    }

    @Transactional(readOnly = true)
    public PageResponse<ConcernResponse> listTenantConcernHistory(UUID tenantUserId, int page, int size) {
        return PageResponse.of(listTenantConcernHistory(tenantUserId), page, size);
    }

    /**
     * Lists open concerns for a property managed by the actor.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listAvailableConcerns(UUID actorUserId, UUID propertyId) {
        concernAccessPolicy.ensureCanView(actorUserId, propertyId);

        return toResponses(concernRepository.findOpenByPropertyId(propertyId));
    }

    private static final ZoneId DASHBOARD_ZONE = ZoneId.of("Asia/Kolkata");

    /**
     * Property-scoped concern rollup for the owner action center.
     *
     * <p>"Raised today" uses the current IST date; "resolved this week" uses a
     * rolling 7-day window; "unattended 24h" counts open, still-unassigned
     * concerns older than 24 hours.
     */
    @Transactional(readOnly = true)
    public ConcernDashboardSummary getPropertyConcernSummary(UUID actorUserId, UUID propertyId) {
        concernAccessPolicy.ensureCanView(actorUserId, propertyId);

        Instant now = Instant.now();
        Instant todayStart = LocalDate.now(DASHBOARD_ZONE).atStartOfDay(DASHBOARD_ZONE).toInstant();
        Instant weekStart = now.minus(7, ChronoUnit.DAYS);
        Instant unattendedCutoff = now.minus(24, ChronoUnit.HOURS);

        long open = concernRepository.countByPropertyIdAndStatus(
                propertyId, com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN);
        long underReview = concernRepository.countByPropertyIdAndStatus(
                propertyId, com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW);
        long inProgress = concernRepository.countByPropertyIdAndStatus(
                propertyId, com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS);
        long escalated = concernRepository.countEscalatedByPropertyId(propertyId);
        long actionableEscalated = concernRepository.countActionableEscalatedByPropertyId(propertyId);
        long reopened = concernRepository.countActiveReopenedByPropertyId(propertyId);
        long resolvedThisWeek = concernRepository.countResolvedByPropertyIdAfter(propertyId, weekStart);
        long raisedToday = concernRepository.countByPropertyIdAndCreatedAtAfter(propertyId, todayStart);
        long unattended24h = concernRepository.countUnattendedOpenByPropertyId(propertyId, unattendedCutoff);

        return new ConcernDashboardSummary(
                open,
                underReview,
                inProgress,
                escalated,
                actionableEscalated,
                reopened,
                resolvedThisWeek,
                raisedToday,
                unattended24h);
    }

    /**
     * Lists concerns currently assigned to the actor, whether under review or
     * actively in progress.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listUndertakenConcerns(UUID actorUserId) {
        return toResponses(concernRepository.findInProgressByAssignedToUserId(actorUserId));
    }

    /**
     * Lists resolved and closed concern history for a property managed by the actor.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listPropertyConcernHistory(UUID actorUserId, UUID propertyId) {
        concernAccessPolicy.ensureCanView(actorUserId, propertyId);

        return toResponses(concernRepository.findHistoryByPropertyId(propertyId));
    }

    @Transactional(readOnly = true)
    public PageResponse<ConcernResponse> listPropertyConcernHistory(UUID actorUserId, UUID propertyId, int page, int size) {
        return PageResponse.of(listPropertyConcernHistory(actorUserId, propertyId), page, size);
    }

    /**
     * Lists escalated concerns for a managed property.
     */
    @Transactional(readOnly = true)
    public List<ConcernResponse> listEscalatedConcerns(UUID actorUserId, UUID propertyId) {
        concernAccessPolicy.ensureCanView(actorUserId, propertyId);

        return toResponses(concernRepository.findEscalatedByPropertyId(propertyId));
    }

    @Transactional(readOnly = true)
    public List<ConcernResponse> listActiveAssignedConcerns(UUID actorUserId, UUID propertyId) {
        concernAccessPolicy.ensureCanView(actorUserId, propertyId);

        return toResponses(concernRepository.findActiveAssignedByPropertyId(propertyId));
    }

    @Transactional(readOnly = true)
    public List<ConcernResponse> listOwnerMonitorConcerns(UUID actorUserId, UUID propertyId) {
        ensurePropertyOwner(actorUserId, propertyId);

        return toResponses(concernRepository.findOwnerMonitorByPropertyId(propertyId, Instant.now()));
    }

    /**
     * Assigns a concern to an owner or manager who can manage its property.
     */
    @Transactional
    public ConcernResponse assignConcern(UUID actorUserId, UUID concernId, AssignConcernRequest request) {
        Concern concern = getConcern(concernId);
        concernAccessPolicy.ensureCanManage(actorUserId, concern.getPropertyId());
        // The assignee, not the actor: a concern handed to someone who cannot
        // work concerns is an item nobody can clear.
        concernAccessPolicy.ensureAssigneeCanWorkConcerns(request.assignedToUserId(), concern.getPropertyId());

        try {
            concern.assignTo(request.assignedToUserId(), actorUserId, Instant.now());
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
                actorUserId,
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
        concernAccessPolicy.ensureCanManage(actorUserId, concern.getPropertyId());

        try {
            switch (request.status()) {
                case OPEN -> concern.markOpen();
                case UNDER_REVIEW -> concern.markUnderReview(actorUserId, Instant.now());
                case IN_PROGRESS -> concern.markInProgress(actorUserId, Instant.now());
                default -> throw new ValidationException("Use resolve or close-expired flow for this concern status");
            }
            concern.updateStatusNote(normalizeStatusNote(request.statusNote()));
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
                actorUserId,
                concern.getStatus(),
                concern.getTitle()));

        return toResponse(concern);
    }

    private String normalizeStatusNote(String statusNote) {
        if (statusNote == null || statusNote.isBlank()) {
            return null;
        }
        return statusNote.trim();
    }

    /**
     * Marks a concern resolved and starts the three-day tenant reopen window.
     */
    @Transactional
    public ConcernResponse resolveConcern(UUID actorUserId, UUID concernId, ResolveConcernRequest request) {
        Concern concern = getConcern(concernId);
        concernAccessPolicy.ensureCanManage(actorUserId, concern.getPropertyId());

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

    @Transactional(readOnly = true)
    public List<ConcernResponse> findOpenUnassignedCreatedBefore(Instant createdBefore) {
        return toResponses(concernRepository.findOpenUnassignedCreatedBefore(createdBefore));
    }

    @Transactional(readOnly = true)
    public UUID findTenancyIdForConcern(UUID concernId) {
        return getConcern(concernId).getTenancyId();
    }

    /**
     * Promotes old open/under-review concerns into visible escalation levels.
     */
    @Transactional
    /** Null-safe ordinal, so a concern with no level yet counts as the floor. */
    private static int ordinalOf(ConcernEscalationLevel level) {
        return level == null ? ConcernEscalationLevel.NONE.ordinal() : level.ordinal();
    }

    public int updateConcernEscalationLevels() {
        Instant now = Instant.now();
        Instant attentionThreshold = now.minus(ConcernEscalationLevel.ATTENTION_THRESHOLD);
        List<Concern> concerns = concernRepository.findEscalationCandidates(attentionThreshold);
        int updatedCount = 0;

        for (Concern concern : concerns) {
            ConcernEscalationLevel before = concern.getEscalationLevel();
            if (!concern.refreshEscalationLevel(now)) {
                continue;
            }
            updatedCount = updatedCount + 1;

            // Only a RISE is an event. A level falling back to NONE means the
            // concern was picked up or resolved, which the status change
            // already announced — publishing here too would report the good
            // news as an escalation.
            if (concern.getEscalationLevel().ordinal() > ordinalOf(before)) {
                eventPublisher.publishEvent(new ConcernEscalatedEvent(
                        concern.getId(),
                        concern.getPropertyId(),
                        concern.getRaisedByUserId(),
                        concern.getEscalationLevel(),
                        concern.getTitle()));
            }
        }

        if (updatedCount > 0) {
            log.info("Concern escalation levels updated checked={} updated={}", concerns.size(), updatedCount);
        }

        return updatedCount;
    }
}
