package com.khatiyan.d_modules.booking.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;

import jakarta.persistence.LockModeType;

/**
 * "Open" in these queries means the stored status and the clock together: a
 * request whose time ran out is history from that moment, whether or not the
 * hourly sweep has written EXPIRED on it yet. Two clocks: the request's while
 * it is negotiated, the token's once terms are agreed, which a waiting claim
 * stops.
 */
@Repository
public interface BookingRequestRepository extends JpaRepository<BookingRequest, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT request FROM BookingRequest request WHERE request.id = :id")
    Optional<BookingRequest> findByIdForUpdate(UUID id);

    /** A retry of the same tap of Send. */
    Optional<BookingRequest> findByProspectUserIdAndIdempotencyKey(UUID prospectUserId, String idempotencyKey);

    /**
     * Every request that stands between a person and the bed they are asking
     * for, locked in one read: their own request or booking at the property
     * that the unique index still counts, and any request on the room that is
     * out of time and still holds a bed. In id order, so two people asking
     * together lock the same rows the same way round and cannot deadlock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT request FROM BookingRequest request
            WHERE (request.prospectUserId = :prospectUserId
                   AND request.propertyId = :propertyId
                   AND request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN,
                        com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED,
                        com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED))
               OR (request.roomId = :roomId
                   AND ((request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT)
                    AND request.expiresAt <= :now)
                   OR (request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                       AND request.tokenClaimWaiting = false AND request.tokenDueAt <= :now)))
            ORDER BY request.id
            """)
    List<BookingRequest> findInTheWayForUpdate(UUID prospectUserId, UUID propertyId, UUID roomId, Instant now);

    boolean existsByProspectUserIdAndStatus(UUID prospectUserId, BookingStatus status);

    /** Which of a visit's two slots are taken. */
    @Query("""
            SELECT request.visitSlot FROM BookingRequest request
            WHERE request.visitId = :visitId AND request.visitSlot IS NOT NULL
            """)
    List<Integer> findUsedVisitSlots(UUID visitId);

    /** Which of a direct booking's two slots are taken: counted by its enquiry, there being no visit (2026-10-17). */
    @Query("""
            SELECT request.visitSlot FROM BookingRequest request
            WHERE request.enquiryId = :enquiryId AND request.visitId IS NULL AND request.visitSlot IS NOT NULL
            """)
    List<Integer> findUsedDirectSlots(UUID enquiryId);

    /** A direct booking's requests that hold one of its two slots. */
    List<BookingRequest> findByEnquiryIdAndVisitIdIsNullAndVisitSlotIsNotNull(UUID enquiryId);

    /** Whether the person walked away from a bed held for nothing here, and is still inside the cooldown. */
    boolean existsByProspectUserIdAndPropertyIdAndCooldownUntilAfter(
            UUID prospectUserId, UUID propertyId, Instant now);

    /** The property's requests and bookings that are still going, newest first. */
    @Query("""
            SELECT request FROM BookingRequest request
            WHERE request.propertyId = :propertyId
              AND (request.status IN (com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED,
                                     com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED)
                   OR (request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                       AND (request.tokenClaimWaiting = true OR request.tokenDueAt > :now))
                   OR (request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT)
                       AND request.expiresAt > :now))
              AND (:anyStatus = true OR request.status = :status)
              AND (:anyHandler = true OR request.handlerUserId = :handlerUserId)
              AND (:unassignedOnly = false OR request.handlerUserId IS NULL
                   OR request.handlerUserId NOT IN :canHandle)
              AND (:attention = 'ALL'
                   OR (:attention = 'RESPONSE' AND request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER)
                   OR (:attention = 'TOKEN_CLAIMS' AND request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN AND request.tokenClaimWaiting = true)
                   OR (:attention = 'CONFIRMATION' AND request.status = com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED)
                   OR (:attention = 'MOVE_IN' AND request.status = com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED
                       AND request.tenancyId IS NULL AND request.moveInDate < :today)
                   OR (:attention = 'MOVE_IN_TODAY' AND request.status = com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED
                       AND request.tenancyId IS NULL AND request.moveInDate = :today))
              AND (:search = '' OR lower(request.tenantName) LIKE :search
                   OR lower(request.referenceCode) LIKE :search OR lower(request.roomNumber) LIKE :search)
            ORDER BY request.submittedAt DESC, request.id DESC
            """)
    Page<BookingRequest> pageOpenForProperty(UUID propertyId, Instant now, boolean anyStatus, BookingStatus status,
            boolean anyHandler, UUID handlerUserId, boolean unassignedOnly, java.util.Collection<UUID> canHandle,
            String attention, java.time.LocalDate today, String search, Pageable pageable);

    /**
     * The property's requests that are over: cancelled, expired, or out of time and not yet swept.
     *
     * <p>A status here is how a request reads, not how it is stored. One out
     * of time and not yet swept reads as expired, so it is found by asking for
     * the expired ones and never by the status it still carries.
     */
    @Query("""
            SELECT request FROM BookingRequest request
            WHERE request.propertyId = :propertyId
              AND (request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.CANCELLED,
                        com.khatiyan.d_modules.booking.model.BookingStatus.EXPIRED,
                        com.khatiyan.d_modules.booking.model.BookingStatus.MOVED_IN)
                   OR ((request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT)
                    AND request.expiresAt <= :now)
                   OR (request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                       AND request.tokenClaimWaiting = false AND request.tokenDueAt <= :now)))
              AND (:anyStatus = true
                   OR (request.status = :status AND request.status IN (
                            com.khatiyan.d_modules.booking.model.BookingStatus.CANCELLED,
                            com.khatiyan.d_modules.booking.model.BookingStatus.EXPIRED,
                            com.khatiyan.d_modules.booking.model.BookingStatus.MOVED_IN))
                   OR (:status = com.khatiyan.d_modules.booking.model.BookingStatus.EXPIRED
                       AND request.status NOT IN (
                            com.khatiyan.d_modules.booking.model.BookingStatus.CANCELLED,
                            com.khatiyan.d_modules.booking.model.BookingStatus.EXPIRED,
                            com.khatiyan.d_modules.booking.model.BookingStatus.MOVED_IN)))
              AND (:anyHandler = true OR request.handlerUserId = :handlerUserId)
              AND (:search = '' OR lower(request.tenantName) LIKE :search
                   OR lower(request.referenceCode) LIKE :search OR lower(request.roomNumber) LIKE :search)
            ORDER BY request.submittedAt DESC, request.id DESC
            """)
    Page<BookingRequest> pageHistoryForProperty(UUID propertyId, Instant now, boolean anyStatus, BookingStatus status,
            boolean anyHandler, UUID handlerUserId, String search, Pageable pageable);

    /** How many of the property's open requests sit in each stored status. One grouped read. */
    @Query("""
            SELECT request.status, COUNT(request) FROM BookingRequest request
            WHERE request.propertyId = :propertyId
              AND (request.status IN (com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED,
                                     com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED)
                   OR (request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                       AND (request.tokenClaimWaiting = true OR request.tokenDueAt > :now))
                   OR (request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT)
                       AND request.expiresAt > :now))
            GROUP BY request.status
            """)
    List<Object[]> countOpenByStatus(UUID propertyId, Instant now);

    /**
     * Four live property-side queues in one read, independent of whether anyone viewed a request. Move-ins
     * count only once their day has passed: today's arrival is not past due yet (user, 2026-10-27).
     */
    @Query("""
            SELECT COALESCE(SUM(CASE WHEN request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER
                                         AND request.expiresAt > :now THEN 1 ELSE 0 END), 0) AS awaitingResponse,
                   COALESCE(SUM(CASE WHEN request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                                         AND request.tokenClaimWaiting = true THEN 1 ELSE 0 END), 0) AS tokenClaims,
                   COALESCE(SUM(CASE WHEN request.status = com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED
                                    THEN 1 ELSE 0 END), 0) AS awaitingConfirmation,
                   COALESCE(SUM(CASE WHEN request.status = com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED
                                         AND request.tenancyId IS NULL AND request.moveInDate < :today
                                    THEN 1 ELSE 0 END), 0) AS moveInsDue,
                   COALESCE(SUM(CASE WHEN request.status = com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED
                                         AND request.tenancyId IS NULL AND request.moveInDate = :today
                                    THEN 1 ELSE 0 END), 0) AS moveInsToday
            FROM BookingRequest request WHERE request.propertyId = :propertyId
            """)
    AttentionCounts countAttention(UUID propertyId, Instant now, java.time.LocalDate today);

    interface AttentionCounts {
        long getAwaitingResponse();
        long getTokenClaims();
        long getAwaitingConfirmation();
        long getMoveInsDue();
        long getMoveInsToday();
    }

    /** The signed-in person's own requests, never anybody else's, newest first. */
    @Query("""
            SELECT request FROM BookingRequest request
            WHERE request.prospectUserId = :prospectUserId
            ORDER BY request.submittedAt DESC, request.id DESC
            """)
    Page<BookingRequest> pageForProspect(UUID prospectUserId, Pageable pageable);

    /** What one person is handling at a property and the unique index still counts, to hand on when they leave. */
    @Query("""
            SELECT request.id FROM BookingRequest request
            WHERE request.propertyId = :propertyId
              AND request.handlerUserId = :handlerUserId
              AND request.status IN (
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT,
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN,
                    com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED,
                    com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED)
            ORDER BY request.id
            """)
    List<UUID> findStoredOpenIdsHandledBy(UUID propertyId, UUID handlerUserId);

    /** Everything a clock has run out on and nothing has written down yet: the sweep expires them. */
    @Query("""
            SELECT request.id FROM BookingRequest request
            WHERE ((request.status IN (
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                        com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT)
                    AND request.expiresAt <= :now)
                   OR (request.status = com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN
                       AND request.tokenClaimWaiting = false AND request.tokenDueAt <= :now))
            ORDER BY request.id
            """)
    List<UUID> findIdsOutOfTime(Instant now);

    /**
     * Whose request this is, without loading it: the person is locked before the
     * row is. An external booking's person has no account until move-in, so its
     * external record stands in for them (2026-10-19).
     */
    @Query("""
            SELECT COALESCE(request.prospectUserId, request.externalProspectId) FROM BookingRequest request
            WHERE request.id = :id AND request.propertyId = :propertyId
            """)
    Optional<UUID> findProspectOf(UUID id, UUID propertyId);

    /**
     * Everything one person has that the unique indexes still count, anywhere,
     * locked in id order. For withdrawing the rest when one is confirmed.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT request FROM BookingRequest request
            WHERE request.prospectUserId = :prospectUserId
              AND request.status IN (
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_HANDLER,
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TENANT,
                    com.khatiyan.d_modules.booking.model.BookingStatus.AWAITING_TOKEN,
                    com.khatiyan.d_modules.booking.model.BookingStatus.TOKEN_RECEIVED,
                    com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED)
            ORDER BY request.id
            """)
    List<BookingRequest> findStoredOpenOfProspectForUpdate(UUID prospectUserId);

    /**
     * Which booking a stay came from. Only the id is read, so the row can be
     * locked afterwards without a stale copy already sitting in the session.
     */
    @Query("SELECT request.id FROM BookingRequest request WHERE request.tenancyId = :tenancyId")
    Optional<UUID> findIdByTenancyId(UUID tenancyId);

    /** A person's agreed booking at a property that no stay has been created from yet. At most one. */
    Optional<BookingRequest> findFirstByProspectUserIdAndPropertyIdAndStatusInAndTenancyIdIsNullOrderBySubmittedAtDesc(
            UUID prospectUserId, UUID propertyId, List<BookingStatus> statuses);

    /**
     * Confirmed bookings whose move-in day falls in these days and that no
     * stay has been created from: the ones whose bed should be free by now.
     */
    @Query("""
            SELECT request.id FROM BookingRequest request
            WHERE request.status = com.khatiyan.d_modules.booking.model.BookingStatus.CONFIRMED
              AND request.tenancyId IS NULL
              AND request.moveInDate BETWEEN :from AND :to
            ORDER BY request.id
            """)
    List<UUID> findIdsDueToMoveIn(java.time.LocalDate from, java.time.LocalDate to);

    /** The requests that hold one of a visit's two slots as stored. At most two. */
    List<BookingRequest> findByVisitIdAndVisitSlotIsNotNull(UUID visitId);

    /** Every booking raised from these enquiries, first to last. For the leads pipeline, through the module. */
    List<BookingRequest> findByEnquiryIdInOrderBySubmittedAtAsc(Collection<UUID> enquiryIds);
}
