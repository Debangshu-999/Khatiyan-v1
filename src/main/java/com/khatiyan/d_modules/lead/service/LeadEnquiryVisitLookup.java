package com.khatiyan.d_modules.lead.service;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.EnquiryVisitLookup;
import com.khatiyan.d_modules.enquiry.EnquiryVisitState;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitBookedBy;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

/** The enquiry module's view of the visits booked from its enquiries. */
@Service
public class LeadEnquiryVisitLookup implements EnquiryVisitLookup {

    private final VisitRepository visitRepository;

    public LeadEnquiryVisitLookup(VisitRepository visitRepository) {
        this.visitRepository = visitRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public EnquiryVisitState stateOf(UUID enquiryId) {
        if (visitRepository.existsByEnquiryIdAndStatus(enquiryId, VisitStatus.SCHEDULED)) {
            return EnquiryVisitState.SCHEDULED;
        }
        return visitRepository.existsByEnquiryIdAndStatus(enquiryId, VisitStatus.CANCELLED)
                ? EnquiryVisitState.CANCELLED
                : EnquiryVisitState.NONE;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, BookedVisit> bookedOn(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return Map.of();
        }
        // One booked visit per enquiry at most (V6190), so the merge never picks.
        return visitRepository.findByEnquiryIdInAndStatus(enquiryIds, VisitStatus.SCHEDULED).stream()
                .collect(Collectors.toMap(
                        Visit::getEnquiryId,
                        visit -> new BookedVisit(visit.getVisitDate(), visit.getSlotStart()),
                        (first, second) -> first));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, CancelledVisit> lastCancelledOn(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return Map.of();
        }
        // An enquiry may have several cancelled visits. The latest one speaks.
        return visitRepository.findByEnquiryIdInAndStatus(enquiryIds, VisitStatus.CANCELLED).stream()
                .filter(visit -> visit.getCancelledAt() != null)
                .collect(Collectors.toMap(
                        Visit::getEnquiryId,
                        visit -> new CancelledVisit(
                                visit.getCancelReason(),
                                visit.getCancelledBy() == VisitBookedBy.TENANT,
                                visit.getCancelledAt()),
                        (first, second) -> first.cancelledAt().isAfter(second.cancelledAt()) ? first : second));
    }
}
