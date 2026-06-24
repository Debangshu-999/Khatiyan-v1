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
        WHERE c.referenceCode = :referenceCode
    """)
    Optional<Concern> findConcernByReferenceCode(String referenceCode);

    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.createdAt >= :windowStart
    """)
    long countRaisedByUserIdSince(UUID tenantUserId, Instant windowStart);

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
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findInProgressByAssignedToUserId(UUID actorUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findCurrentByRaisedByUserId(UUID tenantUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.propertyId = :propertyId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findCurrentByRaisedByUserIdAndPropertyId(UUID tenantUserId, UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.CLOSED
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findHistoryByRaisedByUserId(UUID tenantUserId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.raisedByUserId = :tenantUserId
          AND c.propertyId = :propertyId
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.CLOSED
          )
        ORDER BY c.updatedAt DESC
    """)
    List<Concern> findHistoryByRaisedByUserIdAndPropertyId(UUID tenantUserId, UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED
          AND c.reopenUntil <= :now
        ORDER BY c.reopenUntil ASC
    """)
    List<Concern> findResolvedConcernsPastReopenWindow(Instant now);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN
          AND c.assignedToUserId IS NULL
          AND c.createdAt <= :createdBefore
        ORDER BY c.createdAt ASC
    """)
    List<Concern> findOpenUnassignedCreatedBefore(Instant createdBefore);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW
          )
          AND c.createdAt <= :createdBefore
        ORDER BY c.createdAt ASC
    """)
    List<Concern> findEscalationCandidates(Instant createdBefore);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.escalationLevel <> com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel.NONE
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW
          )
        ORDER BY c.escalationLevel DESC, c.createdAt ASC
    """)
    List<Concern> findEscalatedByPropertyId(UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.assignedToUserId IS NOT NULL
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
          )
        ORDER BY COALESCE(c.assignedAt, c.updatedAt) DESC
    """)
    List<Concern> findActiveAssignedByPropertyId(UUID propertyId);

    @Query("""
        SELECT c
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND (
              (
                  c.assignedToUserId IS NOT NULL
                  AND c.status IN (
                      com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW,
                      com.khatiyan.d_modules.concerns.model.ConcernStatus.IN_PROGRESS
                  )
              )
              OR (
                  c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED
                  AND c.reopenUntil IS NOT NULL
                  AND c.reopenUntil > :now
              )
          )
        ORDER BY c.status ASC, COALESCE(c.assignedAt, c.resolvedAt, c.updatedAt) DESC
    """)
    List<Concern> findOwnerMonitorByPropertyId(UUID propertyId, Instant now);

    // ----- Owner dashboard (action center) counts -----

    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.status = :status
    """)
    long countByPropertyIdAndStatus(
            UUID propertyId,
            com.khatiyan.d_modules.concerns.model.ConcernStatus status);

    /**
     * Active (not resolved/closed) concerns that have been reopened by a tenant.
     * Used for the dashboard "reopened" count.
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.reopened = true
          AND c.status NOT IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.CLOSED
          )
    """)
    long countActiveReopenedByPropertyId(UUID propertyId);

    /**
     * Concerns raised (created) for a property on/after an instant. Used for
     * "concerns raised today".
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.createdAt >= :fromInstant
    """)
    long countByPropertyIdAndCreatedAtAfter(UUID propertyId, Instant fromInstant);

    /**
     * Open, still-unassigned concerns for a property older than a cutoff.
     * Used for "unattended for more than 24h".
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN
          AND c.assignedToUserId IS NULL
          AND c.createdAt < :cutoffInstant
    """)
    long countUnattendedOpenByPropertyId(UUID propertyId, Instant cutoffInstant);

    /**
     * Concerns resolved for a property on/after an instant. Used for
     * "resolved this week".
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.RESOLVED
          AND c.resolvedAt >= :fromInstant
    """)
    long countResolvedByPropertyIdAfter(UUID propertyId, Instant fromInstant);

    /**
     * Escalated active concerns for a property (mirrors
     * {@link #findEscalatedByPropertyId}).
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.escalationLevel <> com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel.NONE
          AND c.status IN (
              com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN,
              com.khatiyan.d_modules.concerns.model.ConcernStatus.UNDER_REVIEW
          )
    """)
    long countEscalatedByPropertyId(UUID propertyId);

    /**
     * Escalated concerns that still need an owner/manager action from the
     * property-level action center. Assigned concerns stay escalated for
     * visibility, but they are no longer pending assignment.
     */
    @Query("""
        SELECT COUNT(c)
        FROM Concern c
        WHERE c.propertyId = :propertyId
          AND c.escalationLevel <> com.khatiyan.d_modules.concerns.model.ConcernEscalationLevel.NONE
          AND c.status = com.khatiyan.d_modules.concerns.model.ConcernStatus.OPEN
          AND c.assignedToUserId IS NULL
    """)
    long countActionableEscalatedByPropertyId(UUID propertyId);
}
