package com.khatiyan.d_modules.property.event;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;

/**
 * Keeps room occupancy synchronized with tenancy lifecycle events.
 *
 * <p>Tenancy owns tenancy records, while property owns room status and
 * vacancy counts. This listener bridges those modules through the
 * {@code PropertyModule} facade before the tenancy transaction commits
 * so occupancy and tenancy records stay atomic.
 */
@Component
public class PropertyTenancyEventListener {

    private final PropertyModule propertyModule;

    public PropertyTenancyEventListener(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyStarted(TenancyStartedEvent event) {
        propertyModule.handleTenancyStarted(event.propertyId(), event.roomId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyEnded(TenancyEndedEvent event) {
        propertyModule.handleTenancyEnded(event.propertyId(), event.roomId());
    }

    // A cancelled pending tenancy frees its reserved bed exactly like an ended
    // tenancy — occupancy was taken at creation via TenancyStartedEvent.
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        propertyModule.handleTenancyEnded(event.propertyId(), event.roomId());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyRoomTransferred(TenancyRoomTransferredEvent event) {
        propertyModule.handleTenancyRoomTransferred(
                event.propertyId(),
                event.oldRoomId(),
                event.newRoomId());
    }
}
