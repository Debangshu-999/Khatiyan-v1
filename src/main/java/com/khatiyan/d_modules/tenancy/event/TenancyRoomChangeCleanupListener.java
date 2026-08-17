package com.khatiyan.d_modules.tenancy.event;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.tenancy.service.TenancyRoomChangeRequestService;

/**
 * Gives back a bed held for an approved room change when the tenancy behind it
 * ends or is cancelled before the move could run.
 *
 * <p>
 * Approving a room change holds a bed on the target room until the transfer
 * date. If the tenancy ends first the move can never execute, so without this
 * the hold would outlive the tenancy and permanently cost the property a bed.
 *
 * <p>
 * Runs BEFORE_COMMIT, in the same transaction as the tenancy change, so the
 * release and the ending are atomic — matching how room occupancy itself is
 * kept in step.
 */
@Component
public class TenancyRoomChangeCleanupListener {

    private final TenancyRoomChangeRequestService roomChangeRequestService;

    /**
     * {@code @Lazy} is required, not cosmetic. The service pulls in
     * {@code BillingModule → BillingCycleService → TenancyModule}, which is what
     * this listener is part of — injecting it eagerly closes that loop and the
     * context fails to start with "TenancyModule could not be found".
     * {@link com.khatiyan.d_modules.tenancy.TenancyModule} breaks the same cycle
     * the same way.
     */
    public TenancyRoomChangeCleanupListener(@Lazy TenancyRoomChangeRequestService roomChangeRequestService) {
        this.roomChangeRequestService = roomChangeRequestService;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyEnded(TenancyEndedEvent event) {
        roomChangeRequestService.closeOpenRequestsForEndedTenancy(event.tenancyId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        roomChangeRequestService.closeOpenRequestsForEndedTenancy(event.tenancyId());
    }
}
