package com.khatiyan.d_modules.enquiry.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.enquiry.EnquiryVisitLookup;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;
import com.khatiyan.d_modules.enquiry.event.EnquiryPostVisitWindowOpenedEvent;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.property.PropertyModule;

/** Synchronous attendance bridge; deliberately no booking persistence or inventory allocation. */
@Service
public class EnquiryBookingEligibilityService {
    private final EnquiryRepository enquiries;
    private final EnquiryVisitLookup visits;
    private final PropertyModule properties;
    private final ChatModule chat;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public EnquiryBookingEligibilityService(EnquiryRepository enquiries, EnquiryVisitLookup visits,
            PropertyModule properties, ChatModule chat, ApplicationEventPublisher events, Clock clock) {
        this.enquiries = enquiries;
        this.visits = visits;
        this.properties = properties;
        this.chat = chat;
        this.events = events;
        this.clock = clock;
    }

    /** Source facts are fetched from recorded attendance, never trusted from a request body. */
    @Transactional
    public boolean attended(UUID enquiryId, UUID visitId) {
        Enquiry enquiry = locked(enquiryId);
        EnquiryVisitLookup.AttendedVisit visit = visits.attendedOn(List.of(enquiryId)).get(enquiryId);
        if (visit == null || !visit.visitId().equals(visitId)
                || !visit.propertyId().equals(enquiry.getPropertyId())
                || !visit.prospectUserId().equals(enquiry.getEnquirerUserId())) {
            throw new ValidationException("The enquiry requires its own recorded attended visit.");
        }
        boolean chatWasClosed = enquiry.getChatClosedAt() != null;
        Instant now = clock.instant();
        if (!enquiry.openPostVisitBookingWindow(visit.visitId(), visit.date(), now)) {
            return false;
        }
        enquiries.saveAndFlush(enquiry);
        if (chatWasClosed && enquiry.getChatThreadId() != null) {
            chat.reopenEnquiryThread(enquiryId);
        }
        events.publishEvent(new EnquiryPostVisitWindowOpenedEvent(enquiryId, enquiry.getPropertyId(),
                enquiry.getEnquirerUserId(), visitId, now));
        return true;
    }

    @Transactional(readOnly = true)
    public PostVisitBookingEligibility forTenant(UUID tenantUserId, UUID enquiryId) {
        Enquiry enquiry = enquiries.findById(enquiryId)
                .filter(found -> found.getEnquirerUserId().equals(tenantUserId))
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));
        properties.getActiveProperty(enquiry.getPropertyId());
        return PostVisitBookingEligibility.of(enquiry, clock.instant());
    }

    /** Internal hook for the later tenant-cancellation transaction, not a public cancellation endpoint. */
    @Transactional
    public boolean closeForTenantCancellation(UUID enquiryId, UUID tenantUserId, UUID visitId) {
        Enquiry enquiry = locked(enquiryId);
        // A stay booked straight from the property profile has no visit: its window is the direct booking's.
        boolean direct = visitId == null && enquiry.getBookingVisitId() == null && enquiry.getDirectBookingAt() != null;
        if (!enquiry.getEnquirerUserId().equals(tenantUserId)
                || (!direct && (visitId == null || !visitId.equals(enquiry.getBookingVisitId())))) {
            throw new ValidationException("The booking must belong to this attended enquiry.");
        }
        return enquiry.closePostVisitBookingWindow(clock.instant());
    }

    private Enquiry locked(UUID enquiryId) {
        return enquiries.findByIdForUpdate(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));
    }
}
