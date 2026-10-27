package com.khatiyan.d_modules.booking.listener;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.service.BookingHandlerService;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;

/**
 * What the booking module hears from other modules.
 *
 * <p>{@code @ApplicationModuleListener} runs after the sender's transaction
 * commits, in its own, and delivers at least once. The handler below does
 * nothing on a repeat: a manager's requests can only be handed on once.
 */
@Component
public class BookingEventListener {

    private final BookingHandlerService handlers;

    public BookingEventListener(BookingHandlerService handlers) {
        this.handlers = handlers;
    }

    /**
     * A manager who leaves cannot go on handling booking requests. Theirs go
     * to the next in turn, or back to whoever opens them first.
     *
     * <p>There is no such event when an owner only takes someone off the
     * bookings access list. That case is caught where it matters: a handler
     * without the grant is treated as no handler on every read and action.
     */
    @ApplicationModuleListener
    public void onManagerRemoved(ManagerRemovedEvent event) {
        handlers.handOn(event.propertyId(), event.managerUserId());
    }
}
