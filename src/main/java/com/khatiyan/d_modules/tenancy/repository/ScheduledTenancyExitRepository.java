package com.khatiyan.d_modules.tenancy.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExit;
import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExitStatus;

import jakarta.persistence.LockModeType;

public interface ScheduledTenancyExitRepository extends JpaRepository<ScheduledTenancyExit, UUID> {

    Optional<ScheduledTenancyExit> findByExitRequestIdAndStatus(
            UUID exitRequestId, ScheduledTenancyExitStatus status);

    Optional<ScheduledTenancyExit> findByTenancyIdAndStatus(
            UUID tenancyId, ScheduledTenancyExitStatus status);

    List<ScheduledTenancyExit> findByPropertyIdAndStatusOrderByScheduledCheckoutDateAsc(
            UUID propertyId, ScheduledTenancyExitStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT scheduled FROM ScheduledTenancyExit scheduled WHERE scheduled.id = :id")
    Optional<ScheduledTenancyExit> findByIdForUpdate(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT scheduled FROM ScheduledTenancyExit scheduled
        WHERE scheduled.exitRequestId = :exitRequestId
          AND scheduled.status = :status
        """)
    Optional<ScheduledTenancyExit> findByExitRequestIdForUpdate(
            UUID exitRequestId, ScheduledTenancyExitStatus status);

    @Query("""
        SELECT scheduled.id
        FROM ScheduledTenancyExit scheduled
        WHERE scheduled.nextAttemptAt <= :now
          AND scheduled.status = com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExitStatus.SCHEDULED
        ORDER BY scheduled.nextAttemptAt ASC
        """)
    List<UUID> findDueIds(Instant now, Pageable pageable);
}
