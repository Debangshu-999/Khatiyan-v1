package com.khatiyan.d_modules.lead.service;

import java.util.List;

import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.lead.model.Visit;

/**
 * Everything gathered under one lead, as it stands now: its enquiries, its
 * bookings and its visits. A lead's own row says what stage it is at. These
 * say what is happening on it.
 *
 * @param enquiries first to last
 * @param bookings  first to last
 * @param visits    newest first
 */
record LeadStanding(List<EnquirySnapshot> enquiries, List<BookingSnapshot> bookings, List<Visit> visits) {

    static final LeadStanding NOTHING = new LeadStanding(List.of(), List.of(), List.of());

    /** The booking still going. At most one: a person holds one bed at a property at a time. */
    BookingSnapshot liveBooking() {
        return bookings.stream().filter(BookingSnapshot::isLive).reduce((earlier, later) -> later).orElse(null);
    }

    /** The live booking, or else the last one there was. */
    BookingSnapshot currentBooking() {
        BookingSnapshot live = liveBooking();
        return live != null || bookings.isEmpty() ? live : bookings.get(bookings.size() - 1);
    }

    Visit latestVisit() {
        return visits.isEmpty() ? null : visits.get(0);
    }
}
