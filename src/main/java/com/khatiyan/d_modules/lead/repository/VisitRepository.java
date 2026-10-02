package com.khatiyan.d_modules.lead.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.Visit;

@Repository
public interface VisitRepository extends JpaRepository<Visit, UUID> {

    /** A lead's visits, newest first. A handful at most: one per enquiry the person raised. */
    List<Visit> findByLeadIdOrderByCreatedAtDesc(UUID leadId);

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
