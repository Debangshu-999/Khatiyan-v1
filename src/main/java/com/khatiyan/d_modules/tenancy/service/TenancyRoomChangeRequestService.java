package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyRoomChangeRequestResponse;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
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

    private final TenancyRoomChangeRequestRepository roomChangeRequestRepository;
    private final TenancyRepository tenancyRepository;
    private final PropertyModule propertyModule;
    private final BillingModule billingModule;
    private final TenancyService tenancyService;
    @SuppressWarnings("unused")
    private final ApplicationEventPublisher eventPublisher;

    public TenancyRoomChangeRequestService(
            TenancyRoomChangeRequestRepository roomChangeRequestRepository,
            TenancyRepository tenancyRepository,
            PropertyModule propertyModule,
            BillingModule billingModule,
            TenancyService tenancyService,
            ApplicationEventPublisher eventPublisher) {
        this.roomChangeRequestRepository = roomChangeRequestRepository;
        this.tenancyRepository = tenancyRepository;
        this.propertyModule = propertyModule;
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

        return TenancyRoomChangeRequestResponse.from(saved);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse approve(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());
        ensureTargetStillAvailable(request);

        request.approve(actorUserId, adminNotes);
        log.info("Tenancy room change approved requestId={} actorUserId={}", requestId, actorUserId);

        return TenancyRoomChangeRequestResponse.from(request);
    }

    @Transactional
    public TenancyRoomChangeRequestResponse reject(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyRoomChangeRequest request = getRequest(requestId);
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());

        request.reject(actorUserId, adminNotes);
        log.info("Tenancy room change rejected requestId={} actorUserId={}", requestId, actorUserId);

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
        return roomChangeRequestRepository.findByTenantUserId(tenantUserId)
                .stream()
                .map(TenancyRoomChangeRequestResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TenancyRoomChangeRequestResponse> listForTenancy(UUID actorUserId, UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.getPropertyId());

        return roomChangeRequestRepository.findByTenancyId(tenancyId)
                .stream()
                .map(TenancyRoomChangeRequestResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TenancyRoomChangeRequestResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return roomChangeRequestRepository.findByPropertyId(propertyId)
                .stream()
                .map(TenancyRoomChangeRequestResponse::from)
                .toList();
    }

    private TenancyRoomChangeRequestResponse executeApprovedRequest(
            UUID actorUserId,
            TenancyRoomChangeRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());

        if (request.getStatus() != TenancyRoomChangeRequestStatus.APPROVED) {
            throw new ValidationException("Only approved room change requests can be executed");
        }

        if (request.getEffectiveTransferDate().isAfter(LocalDate.now())) {
            throw new ValidationException("Room change request is not due for execution");
        }

        ensureNextCycleHasNotBeenGenerated(actorUserId, request);
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
}
