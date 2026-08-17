package com.khatiyan.d_modules.tenancy.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomChangeRequestedEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyRoomChangeRequestStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRoomChangeRequestRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Handles tenant room-change requests that execute at billing-cycle boundary.
 */
@Slf4j
@Service
public class TenancyRoomChangeRequestService {

    private static final List<TenancyRoomChangeRequestStatus> OPEN_STATUSES = List.of(
            TenancyRoomChangeRequestStatus.REQUESTED,
            TenancyRoomChangeRequestStatus.APPROVED);

    private final AuthModule authModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final TenancyRoomChangeRequestRepository roomChangeRequestRepository;
    private final TenancyRepository tenancyRepository;
    private final PropertyModule propertyModule;
    private final TenancyAccessPolicy tenancyAccessPolicy;
    private final BillingModule billingModule;
    private final TenancyService tenancyService;
    @SuppressWarnings("unused")
    private final ApplicationEventPublisher eventPublisher;

    public TenancyRoomChangeRequestService(
            AuthModule authModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            TenancyRoomChangeRequestRepository roomChangeRequestRepository,
            TenancyRepository tenancyRepository,
            PropertyModule propertyModule,
            TenancyAccessPolicy tenancyAccessPolicy,
            @Lazy BillingModule billingModule,
            TenancyService tenancyService,
            ApplicationEventPublisher eventPublisher) {
        this.authModule = authModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.roomChangeRequestRepository = roomChangeRequestRepository;
        this.tenancyRepository = tenancyRepository;
        this.propertyModule = propertyModule;
        this.tenancyAccessPolicy = tenancyAccessPolicy;
        this.billingModule = billingModule;
        this.tenancyService = tenancyService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public TenancyRoomChangeRequestResponse requestRoomChange(
            UUID tenantUserId,
            UUID targetRoomId,
            String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        ensureNoOpenRequest(tenancy.getId());

        if (tenancy.getRoomId().equals(targetRoomId)) {
            throw new ValidationException("Target room must be different from current room");
        }

        BillingCycleResponse cycle = billingModule.getLatestMyCycle(tenantUserId);
        RoomResponse targetRoom = propertyModule.getActiveRoom(tenancy.getPropertyId(), targetRoomId);
        validateTargetRoom(tenancy, targetRoom);

        TenancyRoomChangeRequest request = TenancyRoomChangeRequest.request(
                referenceCodeGenerator.nextCode("TRC"),
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                targetRoom.id(),
                cycle.id(),
                cycle.periodEndDate(),
                reason,
                targetRoom.baseRentPaise());

        TenancyRoomChangeRequest saved = roomChangeRequestRepository.save(request);
        log.info(
                "Tenancy room change requested requestId={} tenancyId={} currentRoomId={} targetRoomId={} effectiveTransferDate={}",
                saved.getId(),
                tenancy.getId(),
                tenancy.getRoomId(),
                targetRoom.id(),
                cycle.periodEndDate());
        eventPublisher.publishEvent(new TenancyRoomChangeRequestedEvent(
                saved.getId(),
                saved.getReferenceCode(),
                saved.getTenancyId(),
                saved.getTenantUserId(),
                saved.getPropertyId(),
                saved.getCurrentRoomId(),
                saved.getTargetRoomId(),
                saved.getEffectiveTransferDate()));

        return TenancyRoomChangeRequestResponse.from(saved);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse approve(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        tenancyAccessPolicy.ensureCanManageRoomChanges(actorUserId, request.getPropertyId());
        ensureTargetStillAvailable(request);

        request.approve(actorUserId, adminNotes);
        // Hold the bed for the gap between approval and the transfer date.
        // Without this the bed stays available, another tenancy can take it, and
        // the scheduler's re-check then fails the approved move on transfer day.
        propertyModule.reserveRoomSlot(request.getPropertyId(), request.getTargetRoomId());
        log.info(
                "Tenancy room change approved and target bed reserved requestId={} actorUserId={} targetRoomId={}",
                requestId,
                actorUserId,
                request.getTargetRoomId());
        eventPublisher.publishEvent(new TenancyRoomChangeApprovedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getTargetRoomId(),
                request.getEffectiveTransferDate()));

        return TenancyRoomChangeRequestResponse.from(request);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse reject(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        tenancyAccessPolicy.ensureCanManageRoomChanges(actorUserId, request.getPropertyId());

        request.reject(actorUserId, adminNotes);
        log.info("Tenancy room change rejected requestId={} actorUserId={}", requestId, actorUserId);
        eventPublisher.publishEvent(new TenancyRoomChangeRejectedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getAdminNotes()));

        return TenancyRoomChangeRequestResponse.from(request);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse cancel(UUID tenantUserId, UUID requestId) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        request.cancel(tenantUserId);

        log.info("Tenancy room change cancelled requestId={} tenantUserId={}", requestId, tenantUserId);
        return TenancyRoomChangeRequestResponse.from(request);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse execute(UUID actorUserId, UUID requestId) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        return executeApprovedRequest(actorUserId, request);
    }

    @Transactional(readOnly = true)
    public List<UUID> findDueApprovedRequestIds(LocalDate today, int limit) {
        int resolvedLimit = limit > 0 ? limit : 50;
        return roomChangeRequestRepository.findDueForExecutionIds(
                TenancyRoomChangeRequestStatus.APPROVED,
                today,
                PageRequest.of(0, resolvedLimit));
    }

    /**
     * Finds room change requests left unreviewed past the review window.
     */
    @Transactional(readOnly = true)
    public List<UUID> findStaleRequestIds(Instant now, int limit) {
        int resolvedLimit = limit > 0 ? limit : 50;
        Instant cutoff = now.minus(Duration.ofDays(TenancyExitRequest.REVIEW_WINDOW_DAYS));

        return roomChangeRequestRepository.findStaleForExpiryIds(
                TenancyRoomChangeRequestStatus.REQUESTED,
                cutoff,
                PageRequest.of(0, resolvedLimit));
    }

    /**
     * Expires one unreviewed room change request.
     *
     * <p>Only REQUESTED requests are touched, so no reserved bed is released by
     * this sweep — an approved room change holds a bed and must be closed
     * deliberately.
     */
    @Transactional
    public void expireStaleRequest(UUID requestId) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        request.expire();

        log.info("Room change request expired unreviewed requestId={} tenancyId={}",
                requestId, request.getTenancyId());
    }

    @Transactional
    public TenancyRoomChangeRequestResponse executeDueApprovedRequest(UUID requestId) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        UUID actorUserId = request.getDecidedByUserId();
        if (actorUserId == null) {
            throw new ValidationException("Approved room change request is missing approver");
        }

        return executeApprovedRequest(actorUserId, request);
    }

    @Transactional(readOnly = true)
    public List<TenancyRoomChangeRequestResponse> listMine(UUID tenantUserId) {
        return withNames(roomChangeRequestRepository.findByTenantUserId(tenantUserId));
    }

    @Transactional(readOnly = true)
    public List<TenancyRoomChangeRequestResponse> listForTenancy(UUID actorUserId, UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        tenancyAccessPolicy.ensureCanViewRoomChanges(actorUserId, tenancy.getPropertyId());

        return withNames(roomChangeRequestRepository.findByTenancyId(tenancyId));
    }

    @Transactional(readOnly = true)
    public List<TenancyRoomChangeRequestResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        tenancyAccessPolicy.ensureCanViewRoomChanges(actorUserId, propertyId);

        return withNames(roomChangeRequestRepository.findByPropertyId(propertyId));
    }

    /**
     * Closes any open room change for a tenancy that has ended and gives back the
     * bed an approved one was holding. Without this the hold would outlive the
     * tenancy and quietly cost the property a bed forever.
     */
    @Transactional
    public void closeOpenRequestsForEndedTenancy(UUID tenancyId) {
        for (TenancyRoomChangeRequest request : roomChangeRequestRepository.findByTenancyId(tenancyId)) {
            if (!request.cancelBecauseTenancyEnded()) {
                continue;
            }

            propertyModule.releaseRoomSlotReservation(request.getPropertyId(), request.getTargetRoomId());
            log.info(
                    "Room change cancelled and reserved bed released because tenancy ended requestId={} tenancyId={} targetRoomId={}",
                    request.getId(),
                    tenancyId,
                    request.getTargetRoomId());
        }
    }

    private TenancyRoomChangeRequestResponse executeApprovedRequest(
            UUID actorUserId,
            TenancyRoomChangeRequest request) {
        tenancyAccessPolicy.ensureCanManageRoomChanges(actorUserId, request.getPropertyId());

        if (request.getStatus() != TenancyRoomChangeRequestStatus.APPROVED) {
            throw new ValidationException("Only approved room change requests can be executed");
        }

        if (request.getEffectiveTransferDate().isAfter(LocalDate.now())) {
            throw new ValidationException("Room change request is not due for execution");
        }

        ensureNextCycleHasNotBeenGenerated(actorUserId, request);
        // Release our own hold BEFORE the transfer: the transfer publishes
        // TenancyRoomTransferredEvent, whose listener occupies a bed on the
        // target, and occupyOneSlot counts reservations. Holding both would make
        // the room look one bed over capacity and reject the very move the
        // reservation was taken for.
        propertyModule.releaseRoomSlotReservation(request.getPropertyId(), request.getTargetRoomId());
        ensureTargetStillAvailable(request);
        Tenancy tenancy = tenancyService.transferRoom(
                actorUserId,
                request.getTenancyId(),
                request.getTargetRoomId(),
                request.getEffectiveTransferDate());
        Long rentAmountPaise = tenancy.getRentAmountPaise();
        if (rentAmountPaise == null) {
            throw new ValidationException("Executed room change is missing updated rent amount");
        }

        request.markExecuted(rentAmountPaise);
        log.info("Tenancy room change executed requestId={} actorUserId={}", request.getId(), actorUserId);
        eventPublisher.publishEvent(new TenancyRoomChangeExecutedEvent(
                request.getId(),
                request.getReferenceCode(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getTargetRoomId(),
                rentAmountPaise));

        return TenancyRoomChangeRequestResponse.from(request);
    }

    private void ensureNextCycleHasNotBeenGenerated(UUID actorUserId, TenancyRoomChangeRequest request) {
        BillingCycleResponse latestCycle = billingModule.getLatestManagedTenancyCycle(
                actorUserId,
                request.getTenancyId());
        if (!latestCycle.id().equals(request.getBillingCycleId())) {
            throw new ValidationException("Room change cannot execute after the next billing cycle is generated");
        }
    }

    private void ensureTargetStillAvailable(TenancyRoomChangeRequest request) {
        Tenancy tenancy = tenancyRepository.findById(request.getTenancyId())
                .orElseThrow(() -> new NotFoundException("Tenancy", request.getTenancyId()));
        RoomResponse targetRoom = propertyModule.getActiveRoom(request.getPropertyId(), request.getTargetRoomId());
        validateTargetRoom(tenancy, targetRoom);
    }

    private void validateTargetRoom(Tenancy tenancy, RoomResponse targetRoom) {
        if (!targetRoom.propertyId().equals(tenancy.getPropertyId())) {
            throw new ValidationException("Target room does not belong to tenancy property");
        }
        if (targetRoom.id().equals(tenancy.getRoomId())) {
            throw new ValidationException("Target room must be different from current room");
        }
        if (!targetRoom.active()) {
            throw new ValidationException("Target room is not active");
        }
        if (!"VACANT".equals(targetRoom.status().name())
                && !"PARTIALLY_OCCUPIED".equals(targetRoom.status().name())) {
            throw new ValidationException("Target room is not available for room change");
        }
        if (targetRoom.availableVacancies() <= 0) {
            throw new ValidationException("Target room has no available vacancy");
        }
        if (targetRoom.baseRentPaise() <= 0) {
            throw new ValidationException("Target room rent must be configured before room change");
        }
    }

    private Tenancy getTenantActiveTenancy(UUID tenantUserId) {
        return tenancyRepository.findByUserIdAndActiveTrue(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));
    }

    private TenancyRoomChangeRequest getRequest(UUID requestId) {
        return roomChangeRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("TenancyRoomChangeRequest", requestId));
    }

    private void ensureNoOpenRequest(UUID tenancyId) {
        if (roomChangeRequestRepository.findOpenByTenancyId(tenancyId, OPEN_STATUSES).isPresent()) {
            throw new ValidationException("Tenancy already has an open room change request");
        }
    }

    /**
     * Maps requests to responses with tenant and decider names attached, in one
     * batch lookup rather than a query per row.
     */
    private List<TenancyRoomChangeRequestResponse> withNames(List<TenancyRoomChangeRequest> requests) {
        Set<UUID> userIds = new HashSet<>();
        for (TenancyRoomChangeRequest request : requests) {
            userIds.add(request.getTenantUserId());
            if (request.getDecidedByUserId() != null) {
                userIds.add(request.getDecidedByUserId());
            }
        }

        Map<UUID, String> names = authModule.findByIds(userIds).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().fullName()));

        return requests.stream()
                .map(request -> TenancyRoomChangeRequestResponse.from(request, names))
                .toList();
    }
}
