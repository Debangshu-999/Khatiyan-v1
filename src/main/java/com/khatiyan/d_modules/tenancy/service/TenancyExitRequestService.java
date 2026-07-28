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
import com.khatiyan.d_modules.tenancy.api.dto.ApproveTenancyExitRequest;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyExitRequestResponse;
import com.khatiyan.d_modules.tenancy.event.TenancyExitApprovedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitExecutedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRejectedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitRequestedEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequest;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Handles tenant exit request workflows.
 *
 * <p>
 * Normal notice exits are checked against the active billing cycle's rent
 * window. Premature exits are reviewed manually by owner/manager.
 */
@Slf4j
@Service
public class TenancyExitRequestService {

    private static final List<TenancyExitRequestStatus> OPEN_STATUSES = List.of(
            TenancyExitRequestStatus.REQUESTED,
            TenancyExitRequestStatus.APPROVED);

    private final TenancyExitRequestRepository exitRequestRepository;
    private final TenancyRepository tenancyRepository;
    private final PropertyModule propertyModule;
    private final BillingModule billingModule;
    private final TenancyService tenancyService;
    private final ApplicationEventPublisher eventPublisher;

    public TenancyExitRequestService(
            TenancyExitRequestRepository exitRequestRepository,
            TenancyRepository tenancyRepository,
            PropertyModule propertyModule,
            BillingModule billingModule,
            TenancyService tenancyService,
            ApplicationEventPublisher eventPublisher) {
        this.exitRequestRepository = exitRequestRepository;
        this.tenancyRepository = tenancyRepository;
        this.propertyModule = propertyModule;
        this.billingModule = billingModule;
        this.tenancyService = tenancyService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Tenant raises a normal notice exit request inside the rent window.
     */
    @Transactional
    public TenancyExitRequestResponse requestNormalNotice(UUID tenantUserId, String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        // Agreement-backed tenancies never take a plain notice exit — they always
        // go through the early-exit flow (which shows the lock-in penalty).
        if (tenancy.isAgreementBacked()) {
            throw new ValidationException(
                    "This tenancy has an agreement. Please use the early-exit request instead.");
        }
        ensureNoOpenRequest(tenancy.getId());

        BillingCycleResponse cycle = billingModule.getLatestMyCycle(tenantUserId);
        LocalDate today = LocalDate.now();
        ensureInsideNoticeWindow(today, cycle);

        LocalDate checkoutDate = normalCheckoutDate(cycle);
        TenancyExitRequest request = TenancyExitRequest.normalNotice(
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                checkoutDate,
                reason);

        TenancyExitRequest saved = exitRequestRepository.save(request);
        log.info("Normal tenancy exit requested requestId={} tenancyId={} checkoutDate={}",
                saved.getId(), tenancy.getId(), checkoutDate);
        publishExitRequested(saved);

        return TenancyExitRequestResponse.from(saved);
    }

    /**
     * Tenant raises a premature custom-date exit request.
     */
    @Transactional
    public TenancyExitRequestResponse requestPremature(
            UUID tenantUserId,
            LocalDate requestedCheckoutDate,
            String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        ensureNoOpenRequest(tenancy.getId());

        BillingCycleResponse cycle = billingModule.getLatestMyCycle(tenantUserId);
        ensurePrematureCheckoutBeforeCycleEnd(requestedCheckoutDate, cycle);

        TenancyExitRequest request = TenancyExitRequest.premature(
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                requestedCheckoutDate,
                reason);

        TenancyExitRequest saved = exitRequestRepository.save(request);
        log.info("Premature tenancy exit requested requestId={} tenancyId={} checkoutDate={}",
                saved.getId(), tenancy.getId(), requestedCheckoutDate);
        publishExitRequested(saved);

        return TenancyExitRequestResponse.from(saved);
    }

    /**
     * Agreement tenant raises an early exit for a chosen checkout date. The
     * lock-in penalty is computed and applied at approval, not here. Unlike the
     * plain premature flow, the checkout date is not constrained to the current
     * cycle — the tenant serves the notice period before leaving.
     */
    @Transactional
    public TenancyExitRequestResponse requestAgreementExit(
            UUID tenantUserId,
            LocalDate requestedCheckoutDate,
            String reason) {
        Tenancy tenancy = getTenantActiveTenancy(tenantUserId);
        if (!tenancy.isAgreementBacked()) {
            throw new ValidationException("This tenancy does not use the agreement early-exit flow");
        }
        ensureNoOpenRequest(tenancy.getId());
        if (requestedCheckoutDate == null || !requestedCheckoutDate.isAfter(LocalDate.now())) {
            throw new ValidationException("Requested checkout date must be in the future");
        }

        TenancyExitRequest request = TenancyExitRequest.premature(
                tenancy.getId(),
                tenancy.getUserId(),
                tenancy.getPropertyId(),
                tenancy.getRoomId(),
                requestedCheckoutDate,
                reason);

        TenancyExitRequest saved = exitRequestRepository.save(request);
        log.info("Agreement early-exit requested requestId={} tenancyId={} checkoutDate={}",
                saved.getId(), tenancy.getId(), requestedCheckoutDate);
        publishExitRequested(saved);

        return TenancyExitRequestResponse.from(saved);
    }

    /**
     * Owner/manager approves a pending exit request.
     */
    @Transactional
    public TenancyExitRequestResponse approve(UUID actorUserId, UUID requestId, ApproveTenancyExitRequest payload) {
        TenancyExitRequest request = getRequest(requestId);
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());

        // Deposit settlement and final billing are handled at the end-tenancy step
        // now, not at approval. Approval only fixes the checkout date and, for an
        // agreement tenancy, auto-applies the early-exit penalty (as a line on the
        // current unpaid bill, or a new one-off bill if that bill is already paid).
        if (request.isNormalNotice()) {
            request.approveNormal(actorUserId, null, null, null, payload.adminNotes());
            tenancyService.markOnNotice(request.getTenancyId(), request.getApprovedCheckoutDate());
        } else {
            Tenancy tenancy = tenancyRepository.findById(request.getTenancyId())
                    .orElseThrow(() -> new NotFoundException("Tenancy", request.getTenancyId()));
            LocalDate checkoutDate = payload.approvedCheckoutDate() != null
                    ? payload.approvedCheckoutDate()
                    : request.getRequestedCheckoutDate();

            long penaltyPaise = tenancy.isAgreementBacked() ? tenancy.earlyExitPenaltyPaise(checkoutDate) : 0L;
            if (penaltyPaise > 0) {
                billingModule.applyEarlyExitPenalty(actorUserId, request.getTenancyId(), penaltyPaise);
            }
            request.approvePremature(
                    actorUserId,
                    checkoutDate,
                    penaltyPaise > 0 ? penaltyPaise : null,
                    null,
                    null,
                    payload.adminNotes());
            tenancyService.markOnPrematureNotice(request.getTenancyId(), request.getApprovedCheckoutDate());

            log.info(
                    "Premature exit approved requestId={} actorUserId={} checkoutDate={} agreementBacked={} penalty={}",
                    requestId,
                    actorUserId,
                    checkoutDate,
                    tenancy.isAgreementBacked(),
                    penaltyPaise);
        }

        log.info("Tenancy exit request approved requestId={} actorUserId={}", requestId, actorUserId);
        publishExitApproved(request);
        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Owner/manager rejects a pending exit request.
     */
    @Transactional
    public TenancyExitRequestResponse reject(UUID actorUserId, UUID requestId, String adminNotes) {
        TenancyExitRequest request = getRequest(requestId);
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());

        request.reject(actorUserId, adminNotes);
        log.info("Tenancy exit request rejected requestId={} actorUserId={}", requestId, actorUserId);
        publishExitRejected(request);

        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Tenant cancels their own pending request.
     */
    @Transactional
    public TenancyExitRequestResponse cancel(UUID tenantUserId, UUID requestId) {
        TenancyExitRequest request = getRequest(requestId);
        request.cancel(tenantUserId);

        log.info("Tenancy exit request cancelled requestId={} tenantUserId={}", requestId, tenantUserId);
        publishExitCancelled(request);
        return TenancyExitRequestResponse.from(request);
    }

    /**
     * Executes an approved request once checkout date arrives.
     */
    @Transactional
    public TenancyExitRequestResponse execute(UUID actorUserId, UUID requestId) {
        TenancyExitRequest request = getRequest(requestId);
        return executeApprovedRequest(actorUserId, request);
    }

    /**
     * Finds approved requests whose checkout date is due for scheduled execution.
     */
    @Transactional(readOnly = true)
    public List<UUID> findDueApprovedRequestIds(LocalDate today, int limit) {
        int resolvedLimit = limit > 0 ? limit : 50;
        return exitRequestRepository.findDueForExecutionIds(
                TenancyExitRequestStatus.APPROVED,
                today,
                PageRequest.of(0, resolvedLimit));
    }

    /**
     * Scheduler entry point for executing one already-approved due request.
     *
     * <p>
     * The actor is the owner/manager who approved the request. This keeps the
     * same billing and property authorization path as manual execution.
     */
    @Transactional
    public TenancyExitRequestResponse executeDueApprovedRequest(UUID requestId) {
        TenancyExitRequest request = getRequest(requestId);
        UUID actorUserId = request.getDecidedByUserId();
        if (actorUserId == null) {
            throw new ValidationException("Approved exit request is missing approver");
        }

        return executeApprovedRequest(actorUserId, request);
    }

    /**
     * Manual "End tenancy" action for owners/managers, used for stays the exit
     * scheduler does not cover — notably daily tenancies, which never raise an
     * exit request. A monthly tenancy that already holds an approved exit request
     * is executed through that request (so it is marked executed and the usual
     * exit events fire); anything else with a due end date is ended directly. The
     * end date must already have arrived — this never ends a tenancy early.
     */
    @Transactional
    public void endTenancyNow(UUID actorUserId, UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.getPropertyId());

        if (tenancy.getStatus() == TenancyStatus.EXITED || tenancy.getStatus() == TenancyStatus.EVICTED) {
            throw new ValidationException("Tenancy has already ended");
        }

        TenancyExitRequest approved = exitRequestRepository.findByTenancyId(tenancyId).stream()
                .filter(request -> request.getStatus() == TenancyExitRequestStatus.APPROVED)
                .findFirst()
                .orElse(null);
        if (approved != null) {
            executeApprovedRequest(actorUserId, approved);
            return;
        }

        // Active daily stays keep their checkout in plannedEndDate (endDate is only
        // stamped once a tenancy actually ends); monthly stays on notice carry it in
        // endDate. A plain active monthly stay has neither and must use the exit flow.
        LocalDate endDate = tenancy.getBillingType() == TenancyBillingType.DAILY
                ? tenancy.getPlannedEndDate()
                : tenancy.getEndDate();
        if (endDate == null) {
            throw new ValidationException("This tenancy must exit through the exit request workflow");
        }
        if (endDate.isAfter(LocalDate.now())) {
            throw new ValidationException("This tenancy cannot be ended before its end date");
        }

        tenancyService.end(actorUserId, tenancyId, endDate, "MANUAL_END");
        billingModule.markDepositPendingSettlementForExit(actorUserId, tenancyId);

        log.info("Tenancy ended manually tenancyId={} actorUserId={} endDate={}", tenancyId, actorUserId, endDate);
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listMine(UUID tenantUserId) {
        return exitRequestRepository.findByTenantUserId(tenantUserId)
                .stream()
                .map(request -> TenancyExitRequestResponse.from(request))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listForTenancy(UUID actorUserId, UUID tenancyId) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.getPropertyId());

        return exitRequestRepository.findByTenancyId(tenancyId)
                .stream()
                .map(request -> TenancyExitRequestResponse.from(request))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TenancyExitRequestResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return exitRequestRepository.findByPropertyId(propertyId)
                .stream()
                .map(request -> TenancyExitRequestResponse.from(request))
                .toList();
    }

    private TenancyExitRequestResponse executeApprovedRequest(UUID actorUserId, TenancyExitRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, request.getPropertyId());

        if (request.getStatus() != TenancyExitRequestStatus.APPROVED) {
            throw new ValidationException("Only approved exit requests can be executed");
        }

        if (request.getApprovedCheckoutDate() == null || request.getApprovedCheckoutDate().isAfter(LocalDate.now())) {
            throw new ValidationException("Exit request is not due for execution");
        }

        billingModule.ensureLatestCyclePaidForExit(actorUserId, request.getTenancyId());

        tenancyService.end(actorUserId, request.getTenancyId(), request.getApprovedCheckoutDate(),
                "TENANCY_EXIT_REQUEST");
        billingModule.markDepositPendingSettlementForExit(actorUserId, request.getTenancyId());
        request.markExecuted();

        log.info("Tenancy exit request executed requestId={} actorUserId={}", request.getId(), actorUserId);
        publishExitExecuted(request);
        return TenancyExitRequestResponse.from(request);
    }

    private void publishExitRequested(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitRequestedEvent(
                request.getId(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getRequestedCheckoutDate()));
    }

    private void publishExitApproved(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitApprovedEvent(
                request.getId(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getApprovedCheckoutDate()));
    }

    private void publishExitRejected(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitRejectedEvent(
                request.getId(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType()));
    }

    private void publishExitCancelled(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitCancelledEvent(
                request.getId(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType()));
    }

    private void publishExitExecuted(TenancyExitRequest request) {
        eventPublisher.publishEvent(new TenancyExitExecutedEvent(
                request.getId(),
                request.getTenancyId(),
                request.getTenantUserId(),
                request.getPropertyId(),
                request.getType(),
                request.getApprovedCheckoutDate()));
    }

    private Tenancy getTenantActiveTenancy(UUID tenantUserId) {
        return tenancyRepository.findByUserIdAndActiveTrue(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));
    }

    private TenancyExitRequest getRequest(UUID requestId) {
        return exitRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("TenancyExitRequest", requestId));
    }

    private void ensureNoOpenRequest(UUID tenancyId) {
        if (exitRequestRepository.findOpenByTenancyId(tenancyId, OPEN_STATUSES).isPresent()) {
            throw new ValidationException("Tenancy already has an open exit request");
        }
    }

    private void ensureInsideNoticeWindow(LocalDate today, BillingCycleResponse cycle) {
        if (today.isBefore(cycle.periodStartDate()) || today.isAfter(cycle.rentDueDate())) {
            throw new ValidationException("Normal exit request can only be raised inside the rent window");
        }
    }

    private LocalDate normalCheckoutDate(BillingCycleResponse cycle) {
        return cycle.periodEndDate();
    }

    private void ensurePrematureCheckoutBeforeCycleEnd(
            LocalDate requestedCheckoutDate,
            BillingCycleResponse cycle) {
        if (!requestedCheckoutDate.isBefore(cycle.periodEndDate())) {
            throw new ValidationException("Premature checkout date must be before the current billing cycle end date");
        }
    }

}
