package com.khatiyan.d_modules.enquiry;

import java.time.Instant;
import java.time.Clock;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySummary;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryAttentionSummary;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.enquiry.service.EnquiryBookingEligibilityService;
import com.khatiyan.d_modules.enquiry.api.dto.PostVisitBookingEligibility;

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
    private final EnquiryBookingEligibilityService bookingEligibility;
    private final Clock clock;

    public EnquiryModule(EnquiryRepository enquiryRepository, EnquiryService enquiryService,
            EnquiryBookingEligibilityService bookingEligibility, Clock clock) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryService = enquiryService;
        this.bookingEligibility = bookingEligibility;
        this.clock = clock;
    }

    public boolean visitAttended(UUID enquiryId, UUID visitId) {
        return bookingEligibility.attended(enquiryId, visitId);
    }

    /**
     * The record a visit or stay booked straight from the property profile goes
     * on: the person's live enquiry here, or a new direct one (2026-10-17). Runs
     * in the caller's transaction.
     */
    public UUID openDirect(UUID actorUserId, UUID propertyId, com.khatiyan.d_modules.enquiry.model.EnquiryOrigin origin) {
        return enquiryService.openDirect(actorUserId, propertyId, origin);
    }

    public PostVisitBookingEligibility bookingEligibilityFor(UUID tenantUserId, UUID enquiryId) {
        return bookingEligibility.forTenant(tenantUserId, enquiryId);
    }

    public boolean closeBookingWindowForTenantCancellation(UUID enquiryId, UUID tenantUserId, UUID visitId) {
        return bookingEligibility.closeForTenantCancellation(enquiryId, tenantUserId, visitId);
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
        return enquiryRepository.countAwaitingAnswer(propertyId, clock.instant());
    }

    @Transactional(readOnly = true)
    public EnquiryAttentionSummary attentionForProperty(UUID propertyId) {
        Instant now = clock.instant();
        var counts = enquiryRepository.countAttention(propertyId, now);
        return new EnquiryAttentionSummary(counts.getUnassigned(), counts.getAwaiting() - counts.getUnassigned(),
                enquiryRepository.countCallsToRecord(propertyId, now));
    }

    /** One enquiry as it stands now. Empty when it no longer exists. */
    @Transactional(readOnly = true)
    public Optional<EnquirySnapshot> findSnapshot(UUID enquiryId) {
        return enquiryRepository.findById(enquiryId).map(EnquirySnapshot::of);
    }

    /** Each of these enquiries in a line, first raised first. One read for all of them. */
    @Transactional(readOnly = true)
    /**
     * How each enquiry began: an enquiry, or a visit or stay booked straight
     * from the profile. One narrow read, no enquiry loaded (2026-10-19): the
     * Leads insights needed only this, for about a thousand enquiries.
     */
    public java.util.Map<UUID, com.khatiyan.d_modules.enquiry.model.EnquiryOrigin> originsOf(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return java.util.Map.of();
        }
        java.util.Map<UUID, com.khatiyan.d_modules.enquiry.model.EnquiryOrigin> origins = new java.util.HashMap<>();
        for (Object[] row : enquiryRepository.findOrigins(enquiryIds)) {
            origins.put((UUID) row[0], (com.khatiyan.d_modules.enquiry.model.EnquiryOrigin) row[1]);
        }
        return origins;
    }

    public java.util.List<EnquirySummary> summariesOf(Collection<UUID> enquiryIds) {
        if (enquiryIds.isEmpty()) {
            return java.util.List.of();
        }
        Instant now = clock.instant();
        return enquiryRepository.findAllById(enquiryIds).stream()
                .map(enquiry -> new EnquirySummary(
                        enquiry.getId(), enquiry.getMessage(), enquiry.askedAt(), enquiry.getRespondedAt(),
                        enquiry.getExpiresAt(), enquiry.getEndedAt(), enquiry.getEndReason(),
                        EnquirySnapshot.of(enquiry).isOver(now), enquiry.getOrigin()))
                .sorted(java.util.Comparator.comparing(
                        EnquirySummary::raisedAt, java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())))
                .toList();
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

    /**
     * Whether any of these ran out unanswered though somebody tried to reach
     * the person. Their lead then ended for their own reason, not the
     * property's.
     */
    @Transactional(readOnly = true)
    public boolean anyTriedAndUnanswered(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsByIdInAndEndReason(
                enquiryIds, EnquiryEndReason.TENANT_DID_NOT_RESPOND);
    }

    /** Whether any of these enquiries is still inside its window. */
    @Transactional(readOnly = true)
    public boolean anyLive(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsLiveAmong(enquiryIds, clock.instant());
    }

    /**
     * Whether any of these enquiries is still waiting on an answer and inside
     * its window. The leads pipeline asks before closing a record as unanswered.
     */
    @Transactional(readOnly = true)
    public boolean anyAwaitingAnswer(Collection<UUID> enquiryIds) {
        return !enquiryIds.isEmpty() && enquiryRepository.existsAwaitingAnswerAmong(enquiryIds, clock.instant());
    }
}
