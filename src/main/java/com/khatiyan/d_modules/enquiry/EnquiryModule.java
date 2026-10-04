package com.khatiyan.d_modules.enquiry;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;

/**
 * Public facade for the enquiry module.
 *
 * <p>Other modules ask questions here rather than touching the repository. The
 * owner dashboard asks how many enquiries are still waiting on an answer. The
 * leads pipeline asks what an enquiry looks like right now.
 */
@Component
public class EnquiryModule {

    private final EnquiryRepository enquiryRepository;
    private final EnquiryService enquiryService;

    public EnquiryModule(EnquiryRepository enquiryRepository, EnquiryService enquiryService) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryService = enquiryService;
    }

    /** What someone is to an enquiry: the one who asked, management that may act, or neither. */
    public EnquiryParty partyOf(UUID enquiryId, UUID actorUserId) {
        return enquiryService.partyOf(enquiryId, actorUserId);
    }

    /**
     * Unanswered enquiries for a property.
     *
     * <p>Deliberately unguarded, unlike {@code EnquiryService.countOpenForProperty}:
     * the dashboard has already established that the caller manages the property
     * before it assembles anything, and re-running the permission check per
     * counter would add a query per card for an answer already known.
     */
    public long countNewForProperty(UUID propertyId) {
        return enquiryRepository.countAwaitingAnswer(propertyId, Instant.now());
    }

    /** One enquiry as it stands now. Empty when it no longer exists. */
    @Transactional(readOnly = true)
    public Optional<EnquirySnapshot> findSnapshot(UUID enquiryId) {
        return enquiryRepository.findById(enquiryId).map(EnquirySnapshot::of);
    }

    /** Several enquiries as they stand now, in one read. Ones that no longer exist are left out. */
    @Transactional(readOnly = true)
    public Map<UUID, EnquirySnapshot> findSnapshots(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return Map.of();
        }
        return enquiryRepository.findAllById(enquiryIds).stream()
                .collect(Collectors.toMap(Enquiry::getId, EnquirySnapshot::of));
    }

    /**
     * The enquiry's visit became No visit, and the visitor is no longer
     * interested or did not say within the week: it expires now. Runs in the
     * caller's transaction.
     */
    public boolean expireForMissedVisit(UUID enquiryId) {
        return enquiryService.expireForMissedVisit(enquiryId);
    }

    /**
     * A visit was booked on this enquiry. Settles a call still waiting for its
     * answer as Accepted: Interested, and marks the enquiry Interested. Runs in
     * the booking's transaction.
     */
    public void visitBooked(UUID enquiryId, UUID bookedByUserId) {
        enquiryService.onVisitBooked(enquiryId, bookedByUserId);
    }

    /**
     * A visit on this enquiry was cancelled. Its intent follows the answer to
     * "still interested?": Interested, or Not interested with its 7 days. Runs
     * in the cancel's transaction.
     */
    public void visitCancelled(UUID enquiryId, UUID cancelledByUserId, boolean stillInterested) {
        enquiryService.onVisitCancelled(enquiryId, cancelledByUserId, stillInterested);
    }

    /** Whether any of these enquiries is still inside its window. */
    @Transactional(readOnly = true)
    public boolean anyLive(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsLiveAmong(enquiryIds, Instant.now());
    }

    /**
     * Whether any of these enquiries is still waiting on an answer and inside
     * its window. The leads pipeline asks before closing a record as unanswered.
     */
    @Transactional(readOnly = true)
    public boolean anyAwaitingAnswer(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsAwaitingAnswerAmong(enquiryIds, Instant.now());
    }
}
