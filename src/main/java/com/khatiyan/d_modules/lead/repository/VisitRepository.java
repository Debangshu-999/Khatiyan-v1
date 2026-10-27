package com.khatiyan.d_modules.lead.repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;

@Repository
public interface VisitRepository extends JpaRepository<Visit, UUID> {

    /** Today only: no query per visitor, and no historical no-show that only the prospect can resolve. */
    @Query("""
            SELECT COALESCE(SUM(CASE WHEN visit.slotEndMinute > :minute THEN 1 ELSE 0 END), 0) AS arrivalsToday,
                   COALESCE(SUM(CASE WHEN visit.slotEndMinute <= :minute THEN 1 ELSE 0 END), 0) AS attendanceOverdue
            FROM Visit visit WHERE visit.propertyId = :propertyId AND visit.visitDate = :today
              AND visit.enquiryId IS NOT NULL
              AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.SCHEDULED
            """)
    AttentionCounts countAttention(UUID propertyId, LocalDate today, int minute);

    interface AttentionCounts {
        long getArrivalsToday();
        long getAttendanceOverdue();
    }

    /** A lead's visits, newest first. A handful at most: one per enquiry the person raised, plus cancelled ones. */
    List<Visit> findByLeadIdOrderByCreatedAtDesc(UUID leadId);

    /** The visits of several leads, newest first, in one read. */
    List<Visit> findByLeadIdInOrderByCreatedAtDesc(java.util.Collection<UUID> leadIds);

    /** A property's visits in one state that were booked from an enquiry. */
    List<Visit> findByPropertyIdAndStatusAndEnquiryIdIsNotNull(UUID propertyId, VisitStatus status);

    /** The latest visit in one state booked on an enquiry. */
    java.util.Optional<Visit> findFirstByEnquiryIdAndStatusOrderByCreatedAtDesc(UUID enquiryId, VisitStatus status);

    /** Whether an enquiry has a visit in this state. */
    boolean existsByEnquiryIdAndStatus(UUID enquiryId, VisitStatus status);

    /** The visits in one state on any of these enquiries, in one read. */
    List<Visit> findByEnquiryIdInAndStatus(java.util.Collection<UUID> enquiryIds, VisitStatus status);

    /** Every visit on any of these enquiries that was not cancelled: one per enquiry at most. */
    List<Visit> findByEnquiryIdInAndStatusNot(java.util.Collection<UUID> enquiryIds, VisitStatus status);

    /** A property's visits that still stand on an enquiry: booked, attended or missed. For the Enquiries cards. */
    List<Visit> findByPropertyIdAndStatusNotAndEnquiryIdIsNotNull(UUID propertyId, VisitStatus status);

    /**
     * The Manage Visits screen: today's visits whatever became of them, the
     * ones to come, and earlier ones nobody was checked in for. One read.
     */
    @Query("""
            SELECT visit
            FROM Visit visit
            WHERE visit.propertyId = :propertyId
              AND visit.enquiryId IS NOT NULL
              AND visit.status <> com.khatiyan.d_modules.lead.model.VisitStatus.CANCELLED
              AND (visit.visitDate >= :today
                   OR visit.status <> com.khatiyan.d_modules.lead.model.VisitStatus.VISITED)
            ORDER BY visit.visitDate, visit.slotStartMinute
            """)
    List<Visit> findForVisitsScreen(UUID propertyId, LocalDate today);

    /**
     * Past visit dates and cancellations, including records whose enquiry has
     * ended. {@code filter} narrows it by status (user, 2026-10-19): ALL,
     * VISITED, NO_VISIT (a past visit nobody checked in) or CANCELLED.
     */
    @Query("""
            SELECT visit FROM Visit visit
            WHERE visit.propertyId = :propertyId
              AND (visit.visitDate < :today
                   OR visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.CANCELLED)
              AND (:filter = 'ALL'
                   OR (:filter = 'VISITED' AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.VISITED)
                   OR (:filter = 'CANCELLED' AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.CANCELLED)
                   OR (:filter = 'NO_VISIT'
                       AND visit.status <> com.khatiyan.d_modules.lead.model.VisitStatus.VISITED
                       AND visit.status <> com.khatiyan.d_modules.lead.model.VisitStatus.CANCELLED))
            ORDER BY visit.visitDate DESC, visit.slotStartMinute DESC, visit.id DESC
            """)
    Page<Visit> findPropertyHistory(UUID propertyId, LocalDate today, String filter, Pageable pageable);

    /** The signed-in prospect's own history, never another visitor's records. */
    @Query("""
            SELECT visit FROM Visit visit
            WHERE visit.prospectUserId = :prospectUserId
              AND (visit.visitDate < :today
                   OR visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.CANCELLED)
            ORDER BY visit.visitDate DESC, visit.slotStartMinute DESC, visit.id DESC
            """)
    Page<Visit> findProspectHistory(UUID prospectUserId, LocalDate today, Pageable pageable);

    /** Visits still scheduled whose day has passed: the night's sweep marks them No visit. */
    @Query("""
            SELECT visit.id
            FROM Visit visit
            WHERE visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.SCHEDULED
              AND visit.visitDate < :today
            """)
    List<UUID> findIdsScheduledBefore(LocalDate today);

    /** Visits that happened on an earlier day and whose leaving nobody recorded. */
    @Query("""
            SELECT visit.id
            FROM Visit visit
            WHERE visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.VISITED
              AND visit.departedMinute IS NULL
              AND visit.visitDate < :today
            """)
    List<UUID> findIdsVisitedWithoutDepartureBefore(LocalDate today);

    /** No visits whose week has run out, on records still open. */
    @Query("""
            SELECT visit.id
            FROM Visit visit, Lead lead
            WHERE lead.id = visit.leadId
              AND lead.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN
              AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.NOT_VISITED
              AND visit.noVisitAt < :cutoff
            """)
    List<UUID> findIdsNoVisitSince(Instant cutoff);

    /** One person's visits that were not cancelled, at any property, latest first. For My visits. */
    List<Visit> findByProspectUserIdAndStatusNotOrderByVisitDateDescSlotStartMinuteDesc(
            UUID prospectUserId, VisitStatus status);

    /** Visits in one state on any of these dates, at every property: the notification sweep's one read. */
    List<Visit> findByStatusAndVisitDateIn(VisitStatus status, java.util.Collection<LocalDate> dates);

    /** How many visits a property has in one state on one date. */
    long countByPropertyIdAndVisitDateAndStatus(UUID propertyId, LocalDate date, VisitStatus status);

    /** Still scheduled in a slot, leaving out anyone who said they are running late. */
    @Query("""
            SELECT COUNT(visit)
            FROM Visit visit
            WHERE visit.propertyId = :propertyId
              AND visit.visitDate = :date
              AND visit.slotStartMinute = :slotStartMinute
              AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.SCHEDULED
              AND visit.runningLateAt IS NULL
            """)
    long countUnmarkedInSlot(UUID propertyId, LocalDate date, int slotStartMinute);

    /** Whether a lead ever had a visit in this state. Used to name why it closed. */
    boolean existsByLeadIdAndStatus(UUID leadId, VisitStatus status);

    /** The lead's most recently cancelled visit, to tell who cancelled it. */
    java.util.Optional<Visit> findFirstByLeadIdAndStatusOrderByCancelledAtDesc(UUID leadId, VisitStatus status);

    /** The first visit of a lead in one state. The first attended one is when it became an advanced lead. */
    java.util.Optional<Visit> findFirstByLeadIdAndStatusOrderByCheckedInAtAsc(UUID leadId, VisitStatus status);

    /** How many places one slot on one date has taken. */
    @Query("""
            SELECT COUNT(visit)
            FROM Visit visit
            WHERE visit.propertyId = :propertyId
              AND visit.visitDate = :date
              AND visit.slotStartMinute = :slotStartMinute
              AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.SCHEDULED
            """)
    long countScheduled(UUID propertyId, LocalDate date, int slotStartMinute);

    /** Places taken in every slot of a date range, in one grouped query. */
    @Query("""
            SELECT visit.visitDate AS visitDate, visit.slotStartMinute AS slotStartMinute, COUNT(visit) AS taken
            FROM Visit visit
            WHERE visit.propertyId = :propertyId
              AND visit.visitDate BETWEEN :from AND :to
              AND visit.status = com.khatiyan.d_modules.lead.model.VisitStatus.SCHEDULED
            GROUP BY visit.visitDate, visit.slotStartMinute
            """)
    List<SlotTaken> countScheduledBySlot(UUID propertyId, LocalDate from, LocalDate to);

    /** One slot's taken places, for {@link #countScheduledBySlot}. */
    interface SlotTaken {
        LocalDate getVisitDate();

        int getSlotStartMinute();

        long getTaken();
    }
}
