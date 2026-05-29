package com.khatiyan.d_modules.concerns.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.concerns.model.Concern;

/**
 * Persistence access for tenant concerns.
 *
 * <p>Queries are written explicitly because concern filtering is domain-heavy
 * and method-name queries become hard to scan.
 */
@Repository
public interface ConcernRepository extends JpaRepository<Concern, UUID> {

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.id = :id
    """)
    Optional<Concern> findConcernById(UUID id);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN
        ORDER BY c.createdAt DESC
    """)
    List<Concern> findOpenByPropertyId(UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.CLOSED
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findHistoryByPropertyId(UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.assignedToUserId = :actorUserId
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findInProgressByAssignedToUserId(UUID actorUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findCurrentByRaisedByUserId(UUID tenantUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.CLOSED
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findHistoryByRaisedByUserId(UUID tenantUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED
          AND c.reopenUntil <= :now
        ORDER BY c.reopenUntil ASC
    """)
    List<Concern> findResolvedConcernsPastReopenWindow(Instant now);
}
