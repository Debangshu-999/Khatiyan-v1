package com.khatiyan.d_modules.lead.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
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
        // One visit stands on an enquiry at most (V6190), and what became of it speaks.
        Visit standing = visitRepository
                .findByEnquiryIdInAndStatusNot(List.of(enquiryId), VisitStatus.CANCELLED).stream()
                .findFirst()
                .orElse(null);
        if (standing != null) {
            return stateOf(standing, LocalDate.now(LeadVisitService.IST));
        }
        return visitRepository.existsByEnquiryIdAndStatus(enquiryId, VisitStatus.CANCELLED)
                ? EnquiryVisitState.CANCELLED
                : EnquiryVisitState.NONE;
    }

    /** Booked, attended or missed. A visit whose day passed with nobody checked in is missed, swept yet or not. */
    private static EnquiryVisitState stateOf(Visit visit, LocalDate today) {
        if (visit.getStatus() == VisitStatus.VISITED) {
            return EnquiryVisitState.VISITED;
        }
        return visit.isMissed(today) ? EnquiryVisitState.MISSED : EnquiryVisitState.SCHEDULED;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, StandingVisit> standingOn(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return Map.of();
        }
        LocalDate today = LocalDate.now(LeadVisitService.IST);
        return visitRepository.findByEnquiryIdInAndStatusNot(enquiryIds, VisitStatus.CANCELLED).stream()
                .collect(Collectors.toMap(
                        Visit::getEnquiryId,
                        visit -> new StandingVisit(
                                visit.getId(),
                                stateOf(visit, today),
                                visit.getVisitDate(),
                                visit.getSlotStart(),
                                visit.getSlotEnd(),
                                instantOf(visit.passOpensAt()),
                                instantOf(visit.slotStartsAt()),
                                instantOf(visit.runningLateFrom()),
                                instantOf(visit.slotEndsAt()),
                                visit.getCheckedInAt(),
                                visit.getNoVisitAt(),
                                visit.getNoVisitAt() == null
                                        ? null
                                        : visit.getNoVisitAt().plus(Visit.STILL_INTERESTED_FOR),
                                visit.getVersion()),
                        (first, second) -> first));
    }

    private static Instant instantOf(LocalDateTime inIndia) {
        return inIndia.atZone(LeadVisitService.IST).toInstant();
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
