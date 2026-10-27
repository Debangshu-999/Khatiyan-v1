package com.khatiyan.d_modules.booking.listener;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.khatiyan.d_modules.booking.service.BookingConversionService;
import com.khatiyan.d_modules.tenancy.event.TenancyActivatedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;

/**
 * Carries a stay's outcome back to the booking it was converted from.
 *
 * <p>Before commit, inside the stay's own transaction, like the property's
 * bed listener: a stay that started and a booking that still reads
 * "confirmed" must never both be on disk. A stay that did not come from a
 * booking finds nothing here and costs one indexed read.
 */
@Component
public class BookingStayListener {

    private final BookingConversionService conversion;

    public BookingStayListener(BookingConversionService conversion) {
        this.conversion = conversion;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyActivated(TenancyActivatedEvent event) {
        if (event.userId() != null) {
            conversion.onStayStarted(event.tenancyId(), event.userId());
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        if (event.userId() != null) {
            conversion.onStayFellThrough(
                    event.tenancyId(), event.userId(), event.route(), event.actorUserId(), event.reason());
        }
    }
}
