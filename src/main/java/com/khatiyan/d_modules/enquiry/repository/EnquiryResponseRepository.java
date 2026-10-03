package com.khatiyan.d_modules.enquiry.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

@Repository
public interface EnquiryResponseRepository extends JpaRepository<EnquiryResponse, UUID> {

    /**
     * Responses for a page of enquiries, fetched in one query.
     *
     * <p>A list returning many rows would otherwise do one lookup per card just
     * to print "Call-back promised".
     */
    List<EnquiryResponse> findByEnquiryIdInOrderByCreatedAtDesc(Collection<UUID> enquiryIds);

    /** The attempt still open on one channel of an enquiry. At most one, by a partial unique index. */
    /** Whether anyone ever tried to reach them on this enquiry. */
    boolean existsByEnquiryId(UUID enquiryId);

    Optional<EnquiryResponse> findByEnquiryIdAndChannelAndOutcome(
            UUID enquiryId, EnquiryResponseChannel channel, EnquiryAttemptOutcome outcome);

    /** Every attempt of an enquiry in one state, for closing them when the enquiry expires. */
    List<EnquiryResponse> findByEnquiryIdAndOutcome(UUID enquiryId, EnquiryAttemptOutcome outcome);

    /** The attempts one person left open on one channel of a property, for when they leave it. */
    @Query("""
            SELECT attempt
            FROM EnquiryResponse attempt
            WHERE attempt.respondedByUserId = :userId
              AND attempt.channel = :channel
              AND attempt.outcome = com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome.OPEN
              AND attempt.enquiryId IN (
                  SELECT enquiry.id FROM Enquiry enquiry WHERE enquiry.propertyId = :propertyId)
            """)
    List<EnquiryResponse> findOpenByUserOnProperty(UUID userId, UUID propertyId, EnquiryResponseChannel channel);

    /**
     * The calls one person still has to settle on a property: what "Did they
     * respond?" asks about. Oldest first, so they are answered in the order
     * they were made.
     *
     * <p>Theirs means a call they made, or a call on an enquiry they now handle:
     * an enquiry handed to someone new brings its unsettled call with it.
     */
    @Query("""
            SELECT attempt
            FROM EnquiryResponse attempt, Enquiry enquiry
            WHERE enquiry.id = attempt.enquiryId
              AND enquiry.propertyId = :propertyId
              AND attempt.channel = com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel.CALL_BACK
              AND attempt.outcome = com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome.OPEN
              AND (attempt.respondedByUserId = :userId OR enquiry.handlerUserId = :userId)
            ORDER BY attempt.createdAt ASC
            """)
    List<EnquiryResponse> findCallsToSettle(UUID userId, UUID propertyId);

    /**
     * Attempts still open on enquiries whose date has passed, answered or not.
     *
     * <p>Ids only: the sweep settles each in its own transaction and reads it
     * again there.
     */
    @Query("""
            SELECT attempt.id
            FROM EnquiryResponse attempt, Enquiry enquiry
            WHERE enquiry.id = attempt.enquiryId
              AND attempt.outcome = com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome.OPEN
              AND enquiry.expiresAt <= :now
            """)
    List<UUID> findOpenIdsPastEnquiryExpiry(Instant now);
}
