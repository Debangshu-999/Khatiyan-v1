package com.khatiyan.d_modules.notice.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.RecurringNotice;

/**
 * Persistence access for recurring notice templates.
 */
@Repository
public interface RecurringNoticeRepository extends JpaRepository<RecurringNotice, UUID> {

    @Query("""
        SELECT recurringNotice
        FROM RecurringNotice recurringNotice
        WHERE recurringNotice.id = :id
    """)
    Optional<RecurringNotice> findRecurringNoticeById(UUID id);

    @Query("""
        SELECT recurringNotice
        FROM RecurringNotice recurringNotice
        WHERE recurringNotice.propertyId = :propertyId
          AND recurringNotice.status = com.khatiyan.d_modules.notice.model.RecurringNoticeStatus.ACTIVE
        ORDER BY recurringNotice.createdAt DESC
    """)
    List<RecurringNotice> findActiveByPropertyId(UUID propertyId);

    @Query("""
        SELECT recurringNotice
        FROM RecurringNotice recurringNotice
        WHERE recurringNotice.status = com.khatiyan.d_modules.notice.model.RecurringNoticeStatus.ACTIVE
          AND (recurringNotice.activeFrom IS NULL OR recurringNotice.activeFrom <= :generationDate)
          AND (recurringNotice.activeUntil IS NULL OR recurringNotice.activeUntil >= :generationDate)
          AND (
              recurringNotice.lastProcessedForDate IS NULL
              OR recurringNotice.lastProcessedForDate <> :generationDate
          )
        ORDER BY recurringNotice.createdAt ASC
    """)
    List<RecurringNotice> findDueForProcessing(
            @Param("generationDate") LocalDate generationDate,
            Pageable pageable);
}
