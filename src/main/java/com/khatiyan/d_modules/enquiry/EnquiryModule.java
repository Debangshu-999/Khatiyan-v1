package com.khatiyan.d_modules.enquiry;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
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

    /**
     * Whether any of these enquiries is still waiting on an answer and inside
     * its window. The leads pipeline asks before closing a record as unanswered.
     */
    @Transactional(readOnly = true)
    public boolean anyAwaitingAnswer(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsAwaitingAnswerAmong(enquiryIds, Instant.now());
    }
}
