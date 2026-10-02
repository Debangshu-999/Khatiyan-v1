package com.khatiyan.d_modules.lead.listener;

import java.util.UUID;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.enquiry.event.EnquiryEndedEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryExpiredEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryHandlerAssignedEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryRaisedEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryRespondedEvent;
import com.khatiyan.d_modules.lead.service.LeadPipelineService;

/**
 * Every change to an enquiry prompts its lead to catch up.
 *
 * <p>All five handlers do the same thing on purpose. Each event says only that
 * something about the enquiry changed. What changed is read from the enquiry
 * itself, so a repeated or late event cannot leave the lead wrong. See
 * {@link LeadPipelineService}.
 */
@Component
public class LeadEnquiryEventListener {

    private final LeadPipelineService pipeline;

    public LeadEnquiryEventListener(LeadPipelineService pipeline) {
        this.pipeline = pipeline;
    }

    @ApplicationModuleListener
    public void onEnquiryRaised(EnquiryRaisedEvent event) {
        catchUp(event.enquiryId(), event.propertyId(), event.enquirerUserId());
    }

    @ApplicationModuleListener
    public void onEnquiryHandlerAssigned(EnquiryHandlerAssignedEvent event) {
        catchUp(event.enquiryId(), event.propertyId(), event.enquirerUserId());
    }

    @ApplicationModuleListener
    public void onEnquiryResponded(EnquiryRespondedEvent event) {
        catchUp(event.enquiryId(), event.propertyId(), event.enquirerUserId());
    }

    @ApplicationModuleListener
    public void onEnquiryEnded(EnquiryEndedEvent event) {
        catchUp(event.enquiryId(), event.propertyId(), event.enquirerUserId());
    }

    @ApplicationModuleListener
    public void onEnquiryExpired(EnquiryExpiredEvent event) {
        catchUp(event.enquiryId(), event.propertyId(), event.enquirerUserId());
    }

    private void catchUp(UUID enquiryId, UUID propertyId, UUID prospectUserId) {
        pipeline.syncFromEnquiry(enquiryId, propertyId, prospectUserId);
    }
}
