package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.tenancy.event.TenancyPendingExitEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestStatus;
import com.khatiyan.d_modules.tenancy.repository.TenancyExitRequestRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Moves a stay past its checkout date into PENDING_EXIT. It never ENDS one:
 * ending needs a person's assessment (see docs/modules/tenancy.md and the
 * pending-exit spec). What it does is make the overdue stay impossible to miss
 * and stop everything on the account but the bed.
 *
 * <p>Condition-based, not date-based: it asks "is the checkout date past?", so a
 * night the job missed is simply caught on the next run, and running it twice
 * changes nothing.
 */
@Slf4j
@Service
public class PendingExitService {

    private final TenancyRepository tenancyRepository;
    private final TenancyExitRequestRepository exitRequestRepository;
    private final ApplicationEventPublisher eventPublisher;

    public PendingExitService(
            TenancyRepository tenancyRepository,
            TenancyExitRequestRepository exitRequestRepository,
            ApplicationEventPublisher eventPublisher) {
        this.tenancyRepository = tenancyRepository;
        this.exitRequestRepository = exitRequestRepository;
        this.eventPublisher = eventPublisher;
    }

    /** Live stays whose checkout date is before today. */
    @Transactional(readOnly = true)
    public List<UUID> findDue(LocalDate today) {
        return tenancyRepository.findLivePastCheckoutIds(today);
    }

    /**
     * Flips one stay, re-checking everything under its own transaction. False
     * when there is nothing to do. A stay whose tenant has asked to withdraw
     * their exit is left alone: the owner decides that question first.
     */
    @Transactional
    public boolean markPendingExit(UUID tenancyId, LocalDate today) {
        Tenancy tenancy = tenancyRepository.findById(tenancyId).orElse(null);
        if (tenancy == null || !tenancy.isCurrentlyActive() || !tenancy.isPastCheckout(today)) {
            return false;
        }
        boolean withdrawalPending = exitRequestRepository.findByTenancyId(tenancyId).stream()
                .anyMatch(request -> request.getStatus() == TenancyExitRequestStatus.WITHDRAWAL_REQUESTED);
        if (withdrawalPending) {
            log.info("Pending exit skipped, withdrawal awaiting a decision tenancyId={}", tenancyId);
            return false;
        }
        tenancy.markPendingExit();
        tenancyRepository.save(tenancy);
        eventPublisher.publishEvent(new TenancyPendingExitEvent(
                tenancy.getId(), tenancy.getUserId(), tenancy.getPropertyId(), tenancy.getRoomId(), tenancy.checkoutDate()));
        log.info("Stay past its checkout date is now pending exit tenancyId={} checkoutDate={}", tenancyId, tenancy.checkoutDate());
        return true;
    }
}
