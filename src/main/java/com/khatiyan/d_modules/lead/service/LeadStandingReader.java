package com.khatiyan.d_modules.lead.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.BookingModule;
import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadEnquiry;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.repository.LeadEnquiryRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

/**
 * Reads what stands under a set of leads in four queries, however many leads:
 * their enquiry links, those enquiries, the bookings raised from them, and
 * their visits. One lead or fifty costs the same.
 */
@Component
class LeadStandingReader {

    private final LeadEnquiryRepository leadEnquiryRepository;
    private final VisitRepository visitRepository;
    private final EnquiryModule enquiryModule;
    private final BookingModule bookingModule;

    LeadStandingReader(
            LeadEnquiryRepository leadEnquiryRepository, VisitRepository visitRepository,
            EnquiryModule enquiryModule, BookingModule bookingModule) {
        this.leadEnquiryRepository = leadEnquiryRepository;
        this.visitRepository = visitRepository;
        this.enquiryModule = enquiryModule;
        this.bookingModule = bookingModule;
    }

    /** By lead id. A lead with nothing under it is simply absent: read it with {@link LeadStanding#NOTHING}. */
    Map<UUID, LeadStanding> of(Collection<Lead> leads) {
        if (leads.isEmpty()) {
            return Map.of();
        }
        List<UUID> leadIds = leads.stream().map(Lead::getId).toList();

        Map<UUID, UUID> leadOfEnquiry = new HashMap<>();
        Set<UUID> enquiryIds = new LinkedHashSet<>();
        Map<UUID, List<EnquirySnapshot>> enquiriesOf = new HashMap<>();
        List<LeadEnquiry> links = leadEnquiryRepository.findByLeadIdInOrderByJoinedAtAsc(leadIds);
        for (LeadEnquiry link : links) {
            leadOfEnquiry.put(link.getEnquiryId(), link.getLeadId());
            enquiryIds.add(link.getEnquiryId());
        }
        Map<UUID, EnquirySnapshot> snapshots = enquiryModule.findSnapshots(enquiryIds);
        for (LeadEnquiry link : links) {
            EnquirySnapshot snapshot = snapshots.get(link.getEnquiryId());
            if (snapshot != null) {
                enquiriesOf.computeIfAbsent(link.getLeadId(), unused -> new ArrayList<>()).add(snapshot);
            }
        }

        Map<UUID, List<BookingSnapshot>> bookingsOf = new HashMap<>();
        for (BookingSnapshot booking : bookingModule.snapshotsForEnquiries(enquiryIds)) {
            UUID leadId = leadOfEnquiry.get(booking.enquiryId());
            if (leadId != null) {
                bookingsOf.computeIfAbsent(leadId, unused -> new ArrayList<>()).add(booking);
            }
        }

        Map<UUID, List<Visit>> visitsOf = new HashMap<>();
        for (Visit visit : visitRepository.findByLeadIdInOrderByCreatedAtDesc(leadIds)) {
            visitsOf.computeIfAbsent(visit.getLeadId(), unused -> new ArrayList<>()).add(visit);
        }

        Map<UUID, LeadStanding> standing = new HashMap<>();
        for (UUID leadId : leadIds) {
            standing.put(leadId, new LeadStanding(
                    enquiriesOf.getOrDefault(leadId, List.of()),
                    bookingsOf.getOrDefault(leadId, List.of()),
                    visitsOf.getOrDefault(leadId, List.of())));
        }
        return standing;
    }
}
