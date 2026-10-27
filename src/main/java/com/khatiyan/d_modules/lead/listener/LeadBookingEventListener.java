package com.khatiyan.d_modules.lead.listener;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.event.BookingChangedEvent;
import com.khatiyan.d_modules.lead.service.LeadPipelineService;

/**
 * Every change to a booking prompts its lead to catch up.
 *
 * <p>The event says only that the booking changed. What changed is read from
 * the booking itself, with the lead's enquiries and visits, so a repeated or
 * late event cannot leave the lead wrong. It is the same one operation an
 * enquiry event leads to. See {@link LeadPipelineService}.
 */
@Component
public class LeadBookingEventListener {

    private final LeadPipelineService pipeline;
    private final com.khatiyan.d_modules.lead.service.ExternalLeadService external;

    public LeadBookingEventListener(LeadPipelineService pipeline,
            com.khatiyan.d_modules.lead.service.ExternalLeadService external) {
        this.pipeline = pipeline;
        this.external = external;
    }

    @ApplicationModuleListener
    public void onBookingChanged(BookingChangedEvent event) {
        // A booking made outside the app has no enquiry: its lead is the external record's (2026-10-19).
        if (event.enquiryId() == null) {
            external.syncFromBooking(event.requestId());
            return;
        }
        pipeline.syncFromEnquiry(event.enquiryId(), event.propertyId(), event.prospectUserId());
    }
}
