package com.khatiyan.d_modules.enquiry.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import java.time.Instant;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

@Repository
public interface EnquiryRepository extends JpaRepository<Enquiry, UUID> {

    /**
     * The owner's list for the active property, newest first.
     *
     * <p>Drops enquiries that expired more than a day ago. Expiry alone does not
     * hide one: an expired enquiry stays on the list, greyed and unactionable,
     * for a further day, so nothing disappears between two glances at the
     * screen.
     */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND (enquiry.status <> com.khatiyan.d_modules.enquiry.model.EnquiryStatus.EXPIRED
                   OR enquiry.expiresAt > :hiddenBefore)
            ORDER BY enquiry.createdAt DESC
            """)
    List<Enquiry> findVisibleForProperty(UUID propertyId, Instant hiddenBefore);

    /**
     * Open enquiries whose date has passed, for the sweep that ages them out.
     */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt <= :now
            """)
    List<Enquiry> findOpenPastExpiry(Instant now);

    /**
     * Enquiries still genuinely waiting on an answer.
     *
     * <p>Counting by status alone counted the ones whose deadline had passed but
     * whose sweep had not run yet, so every badge in the app read high between
     * the cron's runs — and pointed the owner at questions the enquirer had
     * already been freed to raise again.
     */
    @Query("""
            SELECT COUNT(enquiry)
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt > :now
            """)
    long countAwaitingAnswer(UUID propertyId, Instant now);

    /**
     * Enquiries past their date whose chat is still open, answered or not. Ids
     * only: the sweep closes each in its own transaction and reads it again
     * there.
     */
    @Query("""
            SELECT enquiry.id
            FROM Enquiry enquiry
            WHERE enquiry.chatThreadId IS NOT NULL
              AND enquiry.chatClosedAt IS NULL
              AND enquiry.expiresAt <= :now
            """)
    List<UUID> findIdsWithChatToClose(Instant now);

    /** Whether any of these enquiries is still waiting on an answer, inside its window. */
    @Query("""
            SELECT COUNT(enquiry) > 0
            FROM Enquiry enquiry
            WHERE enquiry.id IN :enquiryIds
              AND enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt > :now
            """)
    boolean existsAwaitingAnswerAmong(Collection<UUID> enquiryIds, Instant now);

    /**
     * The open enquiry this person already has against this property, if any.
     *
     * <p>Drives the profile button turning into "Enquiry sent". The database
     * enforces the same rule with a partial unique index — this is what lets the
     * UI say so before the insert fails.
     */
    Optional<Enquiry> findByPropertyIdAndEnquirerUserIdAndStatus(
            UUID propertyId, UUID enquirerUserId, EnquiryStatus status);

    /**
     * One enquiry, locked for the rest of the transaction.
     *
     * <p>For writes that carry no version of their own: a chat message arriving,
     * a sweep, a manager leaving. A screen's write is guarded by the version it
     * loaded instead.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.id = :enquiryId
            """)
    Optional<Enquiry> findByIdForUpdate(UUID enquiryId);

    /** A page of the property's list, newest first. The same visibility rule as the whole list. */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND (enquiry.status <> com.khatiyan.d_modules.enquiry.model.EnquiryStatus.EXPIRED
                   OR enquiry.expiresAt > :hiddenBefore)
            ORDER BY enquiry.createdAt DESC
            """)
    Page<Enquiry> findVisiblePageForProperty(UUID propertyId, Instant hiddenBefore, Pageable pageable);

    /** A page of the enquiries one person handles on a property: their "My enquiries". */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND enquiry.handlerUserId = :handlerUserId
              AND (enquiry.status <> com.khatiyan.d_modules.enquiry.model.EnquiryStatus.EXPIRED
                   OR enquiry.expiresAt > :hiddenBefore)
            ORDER BY enquiry.createdAt DESC
            """)
    Page<Enquiry> findVisiblePageForHandler(
            UUID propertyId, UUID handlerUserId, Instant hiddenBefore, Pageable pageable);

    /**
     * What a person handles on a property that is still inside its window, for
     * when they leave it.
     *
     * <p>Bounded by the window on purpose. Answered enquiries stay in the table
     * for good, and one whose date has passed is history: moving years of them
     * to the owner would rewrite who handled what for nothing.
     */
    @Query("""
            SELECT enquiry
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND enquiry.handlerUserId = :handlerUserId
              AND enquiry.status <> com.khatiyan.d_modules.enquiry.model.EnquiryStatus.EXPIRED
              AND enquiry.expiresAt > :now
            """)
    List<Enquiry> findLiveHandledBy(UUID propertyId, UUID handlerUserId, Instant now);

    /**
     * The three badges of the enquiries screen, in one query: everything still
     * waiting on an answer, the part of it the viewer handles, and the part
     * nobody handles yet.
     */
    @Query("""
            SELECT COUNT(enquiry) AS awaiting,
                   COALESCE(SUM(CASE WHEN enquiry.handlerUserId = :viewerUserId THEN 1 ELSE 0 END), 0) AS mine,
                   COALESCE(SUM(CASE WHEN enquiry.handlerUserId IS NULL THEN 1 ELSE 0 END), 0) AS unassigned
            FROM Enquiry enquiry
            WHERE enquiry.propertyId = :propertyId
              AND enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.expiresAt > :now
            """)
    AwaitingCounts countAwaiting(UUID propertyId, UUID viewerUserId, Instant now);

    /** One property's waiting enquiries, split three ways, for {@link #countAwaiting}. */
    interface AwaitingCounts {
        long getAwaiting();

        long getMine();

        long getUnassigned();
    }

    /**
     * Properties where the owner assigns each enquiry and some are still
     * waiting, with how many. One row per property, for the daily reminder.
     */
    @Query("""
            SELECT enquiry.propertyId AS propertyId, COUNT(enquiry) AS waiting
            FROM Enquiry enquiry
            WHERE enquiry.status = com.khatiyan.d_modules.enquiry.model.EnquiryStatus.NEW
              AND enquiry.handlerUserId IS NULL
              AND enquiry.expiresAt > :now
              AND enquiry.propertyId IN (
                  SELECT settings.propertyId
                  FROM EnquiryHandlerSettings settings
                  WHERE settings.mode = com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode.OWNER_ASSIGNS)
            GROUP BY enquiry.propertyId
            """)
    List<UnassignedCount> countUnassignedWhereOwnerAssigns(Instant now);

    /** One property's waiting enquiries, for {@link #countUnassignedWhereOwnerAssigns}. */
    interface UnassignedCount {
        UUID getPropertyId();

        long getWaiting();
    }
}
