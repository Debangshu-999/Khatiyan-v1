package com.khatiyan.d_modules.tenancy.event;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExit;
import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExitStatus;
import com.khatiyan.d_modules.tenancy.repository.ScheduledTenancyExitRepository;

/**
 * Keeps configured exit automation synchronized with the request lifecycle.
 * Rows are closed, never deleted, so the audit trail remains intact.
 */
@Component
public class ScheduledTenancyExitLifecycleListener {

    private static final ZoneId EXIT_ZONE = ZoneId.of("Asia/Kolkata");

    private final ScheduledTenancyExitRepository scheduledExitRepository;

    public ScheduledTenancyExitLifecycleListener(
            ScheduledTenancyExitRepository scheduledExitRepository) {
        this.scheduledExitRepository = scheduledExitRepository;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onWithdrawalDecided(TenancyExitWithdrawalDecidedEvent event) {
        ScheduledTenancyExit scheduled = scheduledExitRepository.findByExitRequestIdForUpdate(
                        event.requestId(), ScheduledTenancyExitStatus.SCHEDULED)
                .orElse(null);
        if (scheduled == null) {
            return;
        }
        if (event.approved()) {
            scheduled.reverse(Instant.now());
            return;
        }
        if (!scheduled.getScheduledCheckoutDate().isAfter(LocalDate.now(EXIT_ZONE))) {
            scheduled.defer(Instant.now());
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onExitExecuted(TenancyExitExecutedEvent event) {
        scheduledExitRepository.findByExitRequestIdForUpdate(
                        event.requestId(), ScheduledTenancyExitStatus.SCHEDULED)
                .ifPresent(scheduled -> scheduled.complete(Instant.now()));
    }
}
