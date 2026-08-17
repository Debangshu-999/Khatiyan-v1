package com.khatiyan.d_modules.nudge.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.nudge.model.Nudge;

/**
 * Persistence access for nudges.
 *
 * <p>Nothing here deletes or archives. The screens window to the last seven
 * days by passing a {@code since}; the rows outside it stay on disk.
 */
@Repository
public interface NudgeRepository extends JpaRepository<Nudge, UUID> {

    /** The tenant's own screen. */
    List<Nudge> findByRecipientUserIdAndSentAtGreaterThanEqualOrderBySentAtDesc(UUID recipientUserId, Instant since);

    /** The owner's Sent tab — every nudge for the property, whoever sent it. */
    List<Nudge> findByPropertyIdAndSentAtGreaterThanEqualOrderBySentAtDesc(UUID propertyId, Instant since);

    long countByRecipientUserIdAndReadAtIsNull(UUID recipientUserId);

    /**
     * The most recent nudge per tenancy, for the cooldown column on the send
     * list.
     *
     * <p>One query for the whole list rather than one per tenant: the screen
     * shows every active tenant, and the per-row version would be a fresh
     * lookup for each of them on every open.
     */
    @Query("""
        SELECT nudge
        FROM Nudge nudge
        WHERE nudge.tenancyId IN :tenancyIds
          AND nudge.sentAt = (
              SELECT MAX(latest.sentAt)
              FROM Nudge latest
              WHERE latest.tenancyId = nudge.tenancyId
          )
    """)
    List<Nudge> findLatestPerTenancy(Collection<UUID> tenancyIds);

    /**
     * The cooldown gate, re-read at send time.
     *
     * <p>The list already knows who is in cooldown, but that snapshot is as old
     * as the screen. This is the check that actually holds.
     */
    @Query("""
        SELECT nudge
        FROM Nudge nudge
        WHERE nudge.tenancyId = :tenancyId
        ORDER BY nudge.sentAt DESC
        LIMIT 1
    """)
    java.util.Optional<Nudge> findLatestForTenancy(UUID tenancyId);

    @Query("""
        SELECT nudge
        FROM Nudge nudge
        WHERE nudge.recipientUserId = :recipientUserId
          AND nudge.readAt IS NULL
    """)
    List<Nudge> findUnreadForRecipient(UUID recipientUserId);
}
