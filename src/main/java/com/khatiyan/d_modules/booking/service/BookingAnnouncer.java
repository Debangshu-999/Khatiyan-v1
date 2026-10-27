package com.khatiyan.d_modules.booking.service;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.event.BookingChangedEvent;
import com.khatiyan.d_modules.booking.model.BookingRequest;

/**
 * Tells the rest of the app that a booking changed.
 *
 * <p>Called inside the transaction that made the change, so the event is kept
 * with it and delivered after it commits. A change that rolls back announces
 * nothing. Every write that moves a booking on calls this once: its status,
 * its handler, or the stay it became.
 */
@Component
class BookingAnnouncer {

    private final ApplicationEventPublisher events;

    BookingAnnouncer(ApplicationEventPublisher events) {
        this.events = events;
    }

    void changed(BookingRequest request) {
        events.publishEvent(new BookingChangedEvent(
                request.getId(), request.getPropertyId(), request.getProspectUserId(), request.getEnquiryId()));
    }
}
